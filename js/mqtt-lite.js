// Cliente MQTT 3.1.1 mínimo sobre WebSocket (só QoS 0), para não carregar
// uma biblioteca grande no celular. Reconecta sozinho.

const te = new TextEncoder();
const td = new TextDecoder();

function str(s) {
  const b = te.encode(s);
  return [b.length >> 8, b.length & 255, ...b];
}

function packet(type, body) {
  const len = [];
  let n = body.length;
  do {
    let byte = n % 128;
    n = Math.floor(n / 128);
    if (n > 0) byte |= 128;
    len.push(byte);
  } while (n > 0);
  return new Uint8Array([type, ...len, ...body]);
}

export class MqttLite {
  constructor(url, { keepalive = 10, will = null, onMessage, onStatus } = {}) {
    this.url = url;
    this.keepalive = keepalive;
    this.will = will;
    this.onMessage = onMessage;
    this.onStatus = onStatus;
    this.topics = new Set();
    this.buffer = new Uint8Array(0);
    this.packetId = 1;
    this.connected = false;
    this.closed = false;
    this.retry = 0;
  }

  connect() {
    this.closed = false;
    return new Promise((resolve, reject) => {
      this.pending = { resolve, reject };
      this.open();
    });
  }

  open() {
    const clientId = `dd${Math.random().toString(36).slice(2, 12)}`;
    let ws;
    try {
      ws = new WebSocket(this.url, ['mqtt']);
    } catch (err) {
      this.fail(err);
      return;
    }
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    this.buffer = new Uint8Array(0);

    ws.onopen = () => {
      let flags = 0x02; // sessão limpa
      const payload = [...str(clientId)];
      if (this.will) {
        flags |= 0x04 | (this.will.retain ? 0x20 : 0);
        payload.push(...str(this.will.topic), ...str(this.will.payload));
      }
      const body = [...str('MQTT'), 4, flags, this.keepalive >> 8, this.keepalive & 255, ...payload];
      ws.send(packet(0x10, body));
    };
    ws.onmessage = (event) => this.receive(new Uint8Array(event.data));
    ws.onerror = () => {};
    ws.onclose = () => {
      const was = this.connected;
      this.connected = false;
      clearInterval(this.ping);
      if (this.ws !== ws) return;
      if (was) this.onStatus?.('offline');
      if (this.closed) return;
      if (this.pending && this.retry >= 2) {
        this.fail(new Error('Não foi possível conectar ao servidor'));
        return;
      }
      const wait = Math.min(15000, 800 * 2 ** this.retry++);
      this.reconnectTimer = setTimeout(() => this.open(), wait);
    };
  }

  fail(err) {
    this.closed = true;
    this.pending?.reject(err);
    this.pending = null;
  }

  receive(chunk) {
    const merged = new Uint8Array(this.buffer.length + chunk.length);
    merged.set(this.buffer);
    merged.set(chunk, this.buffer.length);
    this.buffer = merged;

    for (;;) {
      const buf = this.buffer;
      if (buf.length < 2) return;
      let len = 0;
      let mult = 1;
      let i = 1;
      let byte;
      do {
        if (i >= buf.length) return;
        byte = buf[i++];
        len += (byte & 127) * mult;
        mult *= 128;
      } while (byte & 128);
      if (buf.length < i + len) return;
      this.handle(buf[0], buf.subarray(i, i + len));
      this.buffer = buf.slice(i + len);
    }
  }

  handle(header, body) {
    const type = header >> 4;
    if (type === 2) {
      // CONNACK
      if (body[1] !== 0) {
        this.fail(new Error(`Servidor recusou a conexão (${body[1]})`));
        this.ws.close();
        return;
      }
      this.connected = true;
      this.retry = 0;
      this.ping = setInterval(() => this.send(new Uint8Array([0xc0, 0])), (this.keepalive * 1000) / 2);
      for (const topic of this.topics) this.sendSubscribe(topic);
      this.onStatus?.('online');
      this.pending?.resolve();
      this.pending = null;
    } else if (type === 3) {
      // PUBLISH
      const qos = (header >> 1) & 3;
      const tlen = (body[0] << 8) | body[1];
      const topic = td.decode(body.subarray(2, 2 + tlen));
      let offset = 2 + tlen;
      if (qos > 0) {
        const id = [body[offset], body[offset + 1]];
        offset += 2;
        this.send(new Uint8Array([0x40, 2, ...id]));
      }
      const payload = td.decode(body.subarray(offset));
      this.onMessage?.(topic, payload);
    }
  }

  send(bytes) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(bytes);
  }

  sendSubscribe(topic) {
    const id = this.packetId++ & 0xffff || 1;
    this.send(packet(0x82, [id >> 8, id & 255, ...str(topic), 0]));
  }

  subscribe(topic) {
    this.topics.add(topic);
    if (this.connected) this.sendSubscribe(topic);
  }

  publish(topic, payload, { retain = false } = {}) {
    if (!this.connected) return false;
    this.send(packet(0x30 | (retain ? 1 : 0), [...str(topic), ...te.encode(payload)]));
    return true;
  }

  end() {
    this.closed = true;
    clearTimeout(this.reconnectTimer);
    clearInterval(this.ping);
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(new Uint8Array([0xe0, 0]));
    this.ws?.close();
  }
}
