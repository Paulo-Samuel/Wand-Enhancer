import {
  TARGET_SCORE,
  boardEnds,
  canPlay,
  createMatch,
  handPips,
  legalMoves,
  passTurn,
  playMove,
  startRound,
  teamOf,
  tileId,
} from './game.js';
import { chooseMove } from './ai.js';
import { boardSvg, singleTileSvg } from './board.js';

const HUMAN = 0;
const NAMES = ['Você', 'Beto', 'Lia', 'Duda'];
const STORAGE_KEY = 'domino-dupla.match.v1';
const SETTINGS_KEY = 'domino-dupla.settings.v1';
const FINISH_LABEL = {
  simples: 'batida simples',
  carroca: 'batida de carroça',
  laelo: 'lá e lô',
  cruzada: 'cruzada',
  trancado: 'jogo trancado',
};

const $ = (sel) => document.querySelector(sel);
const boardEl = $('#board');
const handEl = $('#hand');
const statusEl = $('#status');
const modal = $('#modal');
const modalBody = $('#modal-body');

let settings = { sound: true, speed: 'normal', level: 2, ...loadJson(SETTINGS_KEY) };
let match = restoreMatch() ?? newMatch();
let selectedId = null;
let botTimer = null;
const bubbles = new Map();

function loadJson(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Armazenamento indisponível (aba privada): o jogo segue sem salvar.
  }
}

function restoreMatch() {
  const saved = loadJson(STORAGE_KEY);
  if (!saved?.round?.hands || saved.round.hands.length !== 4) return null;
  return saved;
}

function newMatch() {
  const m = createMatch();
  startRound(m);
  return m;
}

const delay = () => (settings.speed === 'fast' ? 450 : 900);

// ---------- Som ----------
let audioCtx = null;
function clack() {
  if (!settings.sound) return;
  try {
    audioCtx ??= new (window.AudioContext || window.webkitAudioContext)();
    const len = Math.floor(audioCtx.sampleRate * 0.07);
    const buffer = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 6);
    const src = audioCtx.createBufferSource();
    src.buffer = buffer;
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1800 + Math.random() * 600;
    filter.Q.value = 1.2;
    const gain = audioCtx.createGain();
    gain.gain.value = 0.9;
    src.connect(filter).connect(gain).connect(audioCtx.destination);
    src.start();
  } catch {
    // Sem áudio, sem problema.
  }
}
document.addEventListener('pointerdown', () => audioCtx?.resume?.(), { passive: true });

// ---------- Fluxo ----------
function commit() {
  saveJson(STORAGE_KEY, match);
  render();
  schedule();
}

function showBubble(player, text) {
  bubbles.set(player, text);
  setTimeout(() => {
    if (bubbles.get(player) === text) {
      bubbles.delete(player);
      renderSeats();
    }
  }, 1400);
}

function schedule() {
  clearTimeout(botTimer);
  const round = match.round;
  if (!round) return;
  if (round.result) {
    botTimer = setTimeout(showRoundEnd, 700);
    return;
  }

  const player = round.turn;
  if (player === HUMAN) {
    if (!canPlay(round, HUMAN)) {
      botTimer = setTimeout(() => {
        passTurn(match, HUMAN);
        showBubble(HUMAN, 'Passei');
        commit();
      }, delay() + 500);
    }
    return;
  }

  botTimer = setTimeout(() => {
    const move = chooseMove(round, player, { level: settings.level });
    if (move) {
      playMove(match, player, move);
      clack();
    } else {
      passTurn(match, player);
      showBubble(player, 'Passo!');
    }
    commit();
  }, delay());
}

function humanPlay(move) {
  selectedId = null;
  playMove(match, HUMAN, move);
  clack();
  commit();
}

function onTileTap(id) {
  const round = match.round;
  if (!round || round.result || round.turn !== HUMAN) return;
  const moves = legalMoves(round, HUMAN).filter((m) => tileId(m.tile) === id);
  if (!moves.length) {
    const el = handEl.querySelector(`[data-id="${id}"]`);
    el?.classList.remove('shake');
    void el?.offsetWidth;
    el?.classList.add('shake');
    return;
  }
  if (moves.length === 1) {
    humanPlay(moves[0]);
    return;
  }
  selectedId = selectedId === id ? null : id;
  render();
}

function onSidePick(side) {
  const round = match.round;
  if (!selectedId || round?.turn !== HUMAN) return;
  const move = legalMoves(round, HUMAN).find((m) => tileId(m.tile) === selectedId && m.side === side);
  if (move) humanPlay(move);
}

// ---------- Desenho ----------
function boardShape() {
  const rect = boardEl.getBoundingClientRect();
  const aspect = rect.width && rect.height ? rect.width / rect.height : 1;
  const halfWidth = Math.max(6, Math.min(12, Math.round(5 + aspect * 2.2)));
  return { aspect, halfWidth };
}

function renderBoard() {
  const round = match.round;
  const last = round.lastAction?.type === 'play' ? tileId(round.lastAction.tile) : null;
  const anchors = selectedId && round.board ? ['left', 'right'] : null;
  const svg = boardSvg(round.board, { ...boardShape(), freshId: last, anchors });
  boardEl.innerHTML = round.board
    ? svg
    : `<div class="board-empty">${
      round.mustOpenWith ? `Quem tem a carroça de sena <b>6|6</b> abre o jogo` : 'Mesa vazia'
    }</div>`;
  boardEl.querySelectorAll('.anchor').forEach((el) => {
    el.addEventListener('click', () => onSidePick(el.dataset.side));
  });
}

function renderSeats() {
  const round = match.round;
  document.querySelectorAll('.seat').forEach((seat) => {
    const p = Number(seat.dataset.player);
    const count = round.hands[p].length;
    const backs = Array.from({ length: count }, () => '<span class="back"></span>').join('');
    const bubble = bubbles.get(p);
    seat.className = seat.className.replace(/\s?(active|team-us|team-them)/g, '');
    seat.classList.add(teamOf(p) === 0 ? 'team-us' : 'team-them');
    if (round.turn === p && !round.result) seat.classList.add('active');
    seat.innerHTML = `
      <div class="seat-head">
        <span class="avatar">${NAMES[p][0]}</span>
        <span class="seat-name">${NAMES[p]}${p === 2 ? ' <small>parceira</small>' : ''}</span>
        <span class="seat-count">${count}</span>
      </div>
      <div class="backs">${backs}</div>
      ${bubble ? `<div class="bubble">${bubble}</div>` : ''}`;
  });
  const meBubble = bubbles.get(HUMAN);
  document.querySelector('.me').dataset.bubble = meBubble ?? '';
}

function renderHand() {
  const round = match.round;
  const myTurn = round.turn === HUMAN && !round.result;
  const playable = new Set(myTurn ? legalMoves(round, HUMAN).map((m) => tileId(m.tile)) : []);
  handEl.innerHTML = round.hands[HUMAN]
    .map((tile) => {
      const id = tileId(tile);
      const cls = [
        'hand-tile',
        playable.has(id) ? 'playable' : myTurn ? 'dim' : '',
        selectedId === id ? 'selected' : '',
      ].join(' ');
      return `<button class="${cls}" data-id="${id}" aria-label="Pedra ${tile[0]} e ${tile[1]}">${singleTileSvg(tile)}</button>`;
    })
    .join('');
  handEl.querySelectorAll('.hand-tile').forEach((el) => {
    el.addEventListener('click', () => onTileTap(el.dataset.id));
  });
}

function renderStatus() {
  const round = match.round;
  let text = '';
  if (round.result) {
    text = 'Fim da rodada';
  } else if (round.turn === HUMAN) {
    if (!canPlay(round, HUMAN)) text = 'Sem pedra para jogar… você passa';
    else if (selectedId) {
      const [l, r] = boardEnds(round.board);
      text = `Escolha a ponta:
        <button class="side-btn" data-side="left">◀ ponta ${l}</button>
        <button class="side-btn" data-side="right">ponta ${r} ▶</button>`;
    } else if (!round.board && round.mustOpenWith) text = 'Sua vez: abra com a carroça 6|6';
    else text = 'Sua vez';
  } else {
    const last = round.lastAction;
    const lastText = last
      ? last.type === 'pass'
        ? `${NAMES[last.player]} passou · `
        : `${NAMES[last.player]} jogou ${last.tile[0]}|${last.tile[1]} · `
      : '';
    text = `${lastText}vez de ${NAMES[round.turn]}…`;
  }
  statusEl.innerHTML = text;
  statusEl.querySelectorAll('.side-btn').forEach((el) => {
    el.addEventListener('click', () => onSidePick(el.dataset.side));
  });
}

function render() {
  $('#score-us').textContent = match.scores[0];
  $('#score-them').textContent = match.scores[1];
  $('#round-tag').textContent = `Rodada ${match.roundNo} · até ${TARGET_SCORE}`;
  renderSeats();
  renderBoard();
  renderHand();
  renderStatus();
}

// ---------- Janelas ----------
function openModal(html, onReady) {
  modalBody.innerHTML = html;
  if (!modal.open) modal.showModal();
  onReady?.();
}

function closeModal() {
  if (modal.open) modal.close();
}

function miniHand(hand) {
  if (!hand.length) return '<span class="empty-hand">bateu</span>';
  return hand.map((t) => `<span class="mini-tile">${singleTileSvg(t, false)}</span>`).join('');
}

function showRoundEnd() {
  const round = match.round;
  const res = round.result;
  if (!res) return;

  let title;
  if (res.type === 'trancado') {
    title = res.team === null
      ? 'Jogo trancado — empate!'
      : `Jogo trancado — ${res.team === 0 ? 'nós' : 'eles'} com menos pontos`;
  } else {
    title = res.player === HUMAN ? `Você bateu! (${FINISH_LABEL[res.type]})` : `${NAMES[res.player]} bateu — ${FINISH_LABEL[res.type]}`;
  }
  const gain = res.team === null
    ? 'Ninguém pontua.'
    : `<b class="${res.team === 0 ? 'us-text' : 'them-text'}">+${res.points} ${res.points > 1 ? 'pontos' : 'ponto'}</b> para ${res.team === 0 ? 'Nós' : 'Eles'}`;
  const pipsLine = res.type === 'trancado'
    ? `<p class="small">Pontos na mão: Nós ${res.teamPips[0]} · Eles ${res.teamPips[1]}</p>`
    : '';

  const hands = [0, 1, 2, 3]
    .map((p) => `<div class="reveal-row ${teamOf(p) === 0 ? 'team-us' : 'team-them'}">
      <span class="reveal-name">${NAMES[p]} <small>${handPips(round.hands[p])}</small></span>
      <span class="reveal-tiles">${miniHand(round.hands[p])}</span>
    </div>`)
    .join('');

  const over = match.winner !== null;
  const overHtml = over
    ? `<h2 class="${match.winner === 0 ? 'us-text' : 'them-text'}">${match.winner === 0 ? 'Vocês venceram a partida! 🎉' : 'Eles venceram a partida'}</h2>`
    : '';

  openModal(`
    ${overHtml}
    <h3>${title}</h3>
    <p>${gain}</p>
    ${pipsLine}
    <div class="reveal">${hands}</div>
    <p class="final-score">Nós <b>${match.scores[0]}</b> × <b>${match.scores[1]}</b> Eles</p>
    <button class="primary" id="next-btn">${over ? 'Nova partida' : 'Próxima rodada'}</button>
  `, () => {
    $('#next-btn').addEventListener('click', () => {
      closeModal();
      if (over) match = newMatch();
      else startRound(match);
      selectedId = null;
      commit();
    });
  });
}

function showMenu() {
  openModal(`
    <h3>Menu</h3>
    <div class="menu-list">
      <label class="toggle"><span>Som</span><input type="checkbox" id="opt-sound" ${settings.sound ? 'checked' : ''}></label>
      <label class="toggle"><span>Jogadas rápidas</span><input type="checkbox" id="opt-fast" ${settings.speed === 'fast' ? 'checked' : ''}></label>
      <label class="toggle"><span>Adversários espertos</span><input type="checkbox" id="opt-level" ${settings.level >= 2 ? 'checked' : ''}></label>
      <button id="rules-btn">Regras</button>
      <button id="new-btn" class="danger">Nova partida</button>
      <button id="close-btn" class="primary">Voltar ao jogo</button>
    </div>
  `, () => {
    const persist = () => saveJson(SETTINGS_KEY, settings);
    $('#opt-sound').addEventListener('change', (e) => { settings.sound = e.target.checked; persist(); });
    $('#opt-fast').addEventListener('change', (e) => { settings.speed = e.target.checked ? 'fast' : 'normal'; persist(); });
    $('#opt-level').addEventListener('change', (e) => { settings.level = e.target.checked ? 2 : 1; persist(); });
    $('#rules-btn').addEventListener('click', showRules);
    $('#close-btn').addEventListener('click', () => { closeModal(); schedule(); });
    $('#new-btn').addEventListener('click', () => {
      if (!confirm('Começar uma nova partida? O placar atual será perdido.')) return;
      closeModal();
      match = newMatch();
      selectedId = null;
      commit();
    });
  });
}

function showRules() {
  openModal(`
    <h3>Como jogar</h3>
    <div class="rules">
      <p>Quatro jogadores em duas duplas: <b class="us-text">você e a Lia</b> (sentada à sua frente) contra <b class="them-text">Beto e Duda</b>. Cada um recebe 7 pedras e não há monte.</p>
      <p>A primeira rodada começa com quem tem a <b>carroça de sena (6|6)</b>. Nas seguintes, quem venceu a rodada anterior começa com qualquer pedra. A vez passa no sentido anti-horário.</p>
      <p>Na sua vez, encaixe uma pedra numa das pontas. Sem pedra que sirva, você passa.</p>
      <p><b>Pontuação</b> de quem bate (fica sem pedras):</p>
      <ul>
        <li>Batida simples — 1 ponto</li>
        <li>Carroça (bater com uma pedra dobrada) — 2 pontos</li>
        <li>Lá e lô (a última pedra serve nas duas pontas) — 3 pontos</li>
        <li>Cruzada (carroça que serve nas duas pontas) — 4 pontos</li>
      </ul>
      <p><b>Jogo trancado:</b> se ninguém consegue jogar, somam-se os pontos das pedras de cada dupla e quem tiver menos ganha 1 ponto. Empate não pontua.</p>
      <p>Vence a partida a primeira dupla a fazer <b>${TARGET_SCORE} pontos</b>.</p>
      <p class="small">Toque numa pedra para jogar. Se ela servir nas duas pontas, escolha o lado nas setas da mesa ou nos botões.</p>
    </div>
    <button class="primary" id="back-btn">Entendi</button>
  `, () => {
    $('#back-btn').addEventListener('click', () => { closeModal(); schedule(); });
  });
}

modal.addEventListener('cancel', (e) => {
  // Fim de rodada precisa do botão; o resto fecha normalmente.
  if (match.round?.result) e.preventDefault();
});

$('#menu-btn').addEventListener('click', () => {
  clearTimeout(botTimer);
  showMenu();
});

let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(renderBoard, 120);
});

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

render();
if (match.round.result) showRoundEnd();
else if (match.roundNo === 1 && !match.round.board && !loadJson('domino-dupla.seen-rules')) {
  saveJson('domino-dupla.seen-rules', true);
  showRules();
} else schedule();
