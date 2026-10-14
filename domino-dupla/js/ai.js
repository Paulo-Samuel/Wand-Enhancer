// Jogador automático. Usa apenas informação que um jogador real teria:
// a própria mão, a mesa, quantas pedras cada um tem e em quais números cada um já passou.
import {
  TOTAL_PIPS,
  boardEnds,
  boardTiles,
  handPips,
  isDouble,
  legalMoves,
  partnerOf,
  pipsOf,
  sameTile,
  nextPlayer,
} from './game.js';

function endsAfter(round, move) {
  if (move.side === 'center') return [move.tile[0], move.tile[1]];
  const [left, right] = boardEnds(round.board);
  const end = move.side === 'left' ? left : right;
  const outer = move.tile[0] === end ? move.tile[1] : move.tile[0];
  return move.side === 'left' ? [outer, right] : [left, outer];
}

function countWith(tiles, n) {
  return tiles.reduce((c, t) => c + (t.includes(n) ? 1 : 0), 0);
}

function scoreMove(round, player, move, level) {
  const hand = round.hands[player];
  const rest = hand.filter((t) => !sameTile(t, move.tile));
  const ends = endsAfter(round, move);
  const uniqueEnds = [...new Set(ends)];
  const nextOpp = nextPlayer(player);
  const partner = partnerOf(player);
  const lacks = (p, n) => round.passed[p].includes(n);

  let score = pipsOf(move.tile);
  if (isDouble(move.tile)) score += 7;

  // Manter jogo na mão para as próximas rodadas.
  const followUps = uniqueEnds.reduce((c, n) => c + countWith(rest, n), 0);
  score += followUps * 2.5;
  if (rest.length && followUps === 0) score -= 6;

  if (level >= 1) {
    // Fechar o adversário que joga em seguida.
    const oppBlocked = uniqueEnds.filter((n) => lacks(nextOpp, n)).length;
    score += oppBlocked === uniqueEnds.length ? 10 : oppBlocked * 3;

    // Não fechar o parceiro.
    const partnerBlocked = uniqueEnds.filter((n) => lacks(partner, n)).length;
    if (partnerBlocked === uniqueEnds.length) score -= 6;
  }

  if (level >= 2) {
    // Se a jogada tranca o jogo, só vale quando a dupla provavelmente tem menos pontos.
    const seen = [...boardTiles(round.board), ...hand];
    const remaining = uniqueEnds.reduce((c, n) => c + 7 - countWith(seen, n), 0);
    if (remaining === 0 && rest.every((t) => !uniqueEnds.some((n) => t.includes(n)))) {
      const unknownPips = TOTAL_PIPS - handPips(seen);
      const others = [1, 2, 3].map((k) => round.hands[(player + k) % 4].length);
      const totalOthers = others.reduce((a, b) => a + b, 0) || 1;
      const partnerEstimate = (unknownPips * others[1]) / totalOthers;
      const oppEstimate = (unknownPips * (others[0] + others[2])) / totalOthers;
      score += handPips(rest) + partnerEstimate < oppEstimate ? 25 : -25;
    }
  }

  return score;
}

export function chooseMove(round, player, { level = 2, rng = Math.random } = {}) {
  const moves = legalMoves(round, player);
  if (!moves.length) return null;
  if (moves.length === 1) return moves[0];

  let best = null;
  let bestScore = -Infinity;
  for (const move of moves) {
    const noise = rng() * (level >= 2 ? 1.5 : 6);
    const score = scoreMove(round, player, move, level) + noise;
    if (score > bestScore) {
      best = move;
      bestScore = score;
    }
  }
  return best;
}
