# Dominó em Dupla 🁫

Dominó em dupla para 4 jogadores, feito para jogar no iPhone. Você joga em dupla com a **Lia** (sentada à sua frente) contra **Beto** e **Duda**, controlados pelo computador.

É um web app instalável (PWA): sem App Store, sem conta de desenvolvedor, funciona offline depois de aberto uma vez.

## Instalar no iPhone

1. Abra o link do jogo no **Safari**.
2. Toque em **Compartilhar** → **Adicionar à Tela de Início**.
3. Abra pelo ícone: ele roda em tela cheia, como um app.

A partida fica salva no aparelho; dá para fechar e continuar depois.

## Regras

- 28 pedras (duplo-seis), 7 para cada jogador, sem monte.
- A primeira rodada começa com quem tem a **carroça de sena (6|6)**; nas seguintes, quem venceu a rodada anterior abre com qualquer pedra.
- A vez passa no sentido anti-horário. Sem pedra que sirva, o jogador passa.
- Pontos de quem bate (fica sem pedras):
  - batida simples — 1
  - carroça (última pedra é dobrada) — 2
  - lá e lô (última pedra serve nas duas pontas) — 3
  - cruzada (carroça que serve nas duas pontas) — 4
- **Jogo trancado**: a dupla com menos pontos na mão ganha 1 ponto; empate não pontua.
- Vence a dupla que chegar a **6 pontos**.

## Publicar (GitHub Pages)

Em **Settings → Pages**, escolha *Deploy from a branch*, branch `main`, pasta `/ (root)`. O jogo fica em `https://<usuario>.github.io/domino-dupla/`.

## Desenvolvimento

Sem dependências nem build: HTML, CSS e JavaScript (módulos ES).

```bash
npm start   # servidor local em http://localhost:8080
npm test    # regras, IA e layout da mesa (node --test)
```

| Arquivo | Conteúdo |
| --- | --- |
| `js/game.js` | Regras puras: distribuição, jogadas, passes, batidas, trancamento e placar |
| `js/ai.js` | Jogadores automáticos (só usam informação que um jogador real teria) |
| `js/board.js` | Layout da mesa em "cobra" e desenho das pedras em SVG |
| `js/app.js` | Interface, turnos, som e salvamento |
| `sw.js` | Cache offline — aumente a versão `CACHE` ao alterar arquivos |
