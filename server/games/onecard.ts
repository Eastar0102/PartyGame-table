import { cardLabel, makeDeck, parseCard, sortHand, SUIT_NAME, SUITS, type CardId, type Suit } from '../../shared/cards.ts';
import { nameOf, shuffle, type GameContext, type GameModule } from './types.ts';

interface OneCardState {
  phase: 'playing' | 'over';
  order: string[]; // 아직 게임 중인 사람 (자리 순서)
  hands: Record<string, CardId[]>;
  deck: CardId[];
  discard: CardId[];
  turn: number;
  dir: 1 | -1;
  suit: Suit | null; // 따라 내야 하는 무늬 (null이면 아무거나)
  rank: number | null; // 따라 낼 수 있는 숫자
  attack: number; // 쌓인 공격 장 수
  maxHand: number;
  winner: string | null;
  bankrupt: string[];
  log: string[];
}

/** 공격 카드의 공격력. 공격 카드가 아니면 0 */
export function attackValue(card: CardId): number {
  if (card === 'JR') return 7;
  if (card === 'JB') return 5;
  const c = parseCard(card);
  if (c.rank === 1) return c.suit === 'S' ? 5 : 3;
  if (c.rank === 2) return 2;
  return 0;
}

/** 지금 이 카드를 낼 수 있는지 */
export function canPlay(state: Pick<OneCardState, 'suit' | 'rank' | 'attack'>, card: CardId): boolean {
  const c = parseCard(card);
  if (state.attack > 0) {
    // 공격을 받는 중에는 공격 카드로만 막을 수 있다
    if (attackValue(card) === 0) return false;
    if (c.joker) return true;
    return state.suit === null || c.suit === state.suit || c.rank === state.rank;
  }
  if (c.joker) return true;
  if (state.suit === null) return true;
  return c.suit === state.suit || c.rank === state.rank;
}

function log(state: OneCardState, text: string) {
  state.log.push(text);
  if (state.log.length > 30) state.log.shift();
}

function draw(state: OneCardState, ctx: GameContext, pid: string, n: number): number {
  let drawn = 0;
  for (let i = 0; i < n; i++) {
    if (state.deck.length === 0) {
      // 버린 카드 더미를 섞어서 다시 쓴다 (맨 위 카드는 남김)
      const top = state.discard.pop();
      state.deck = shuffle(state.discard, ctx.random);
      state.discard = top ? [top] : [];
      if (state.deck.length === 0) break;
    }
    state.hands[pid].push(state.deck.pop()!);
    drawn++;
  }
  return drawn;
}

function advance(state: OneCardState, steps = 1) {
  const n = state.order.length;
  state.turn = (((state.turn + state.dir * steps) % n) + n) % n;
}

function finish(state: OneCardState, ctx: GameContext, winner: string, reason: string) {
  state.phase = 'over';
  state.winner = winner;
  log(state, `🏆 ${nameOf(ctx, winner)}님 승리! ${reason}`);
  ctx.announce(`🏆 원카드 승리: ${nameOf(ctx, winner)}님! ${reason}`);
}

/** 손패가 너무 많아지면 파산(탈락) */
function checkBankrupt(state: OneCardState, ctx: GameContext, pid: string): boolean {
  if (state.hands[pid].length < state.maxHand) return false;
  const idx = state.order.indexOf(pid);
  state.deck.unshift(...state.hands[pid]);
  state.hands[pid] = [];
  state.order.splice(idx, 1);
  state.bankrupt.push(pid);
  log(state, `💸 ${nameOf(ctx, pid)}님 파산! (카드 ${state.maxHand}장)`);
  ctx.announce(`💸 ${nameOf(ctx, pid)}님이 카드가 ${state.maxHand}장이 되어 파산했습니다.`);
  if (state.order.length === 1) {
    finish(state, ctx, state.order[0], '마지막까지 살아남았습니다.');
    return true;
  }
  // 파산한 사람 자리를 지웠으니, 다음 차례가 그 자리로 당겨진다
  if (state.dir === 1) state.turn = idx % state.order.length;
  else state.turn = (idx - 1 + state.order.length) % state.order.length;
  return true;
}

export const onecard: GameModule<OneCardState> = {
  meta: {
    id: 'onecard',
    name: '원카드',
    emoji: '🃏',
    description:
      '같은 무늬나 숫자를 내서 손패를 먼저 비우면 승리! 2·A·조커는 공격(2장·3장·♠A 5장·흑백조커 5장·컬러조커 7장), J는 건너뛰기, Q는 방향 전환, K는 한 번 더, 7은 무늬 바꾸기.',
    minPlayers: 2,
    maxPlayers: 8,
  },

  setup(ctx, options) {
    const maxHand = [15, 20, 25].includes(Number(options.maxHand)) ? Number(options.maxHand) : 20;
    const deck = shuffle(makeDeck(['JB', 'JR']), ctx.random);
    const order = shuffle(ctx.players.map((p) => p.id), ctx.random);
    const hands: Record<string, CardId[]> = {};
    for (const id of order) hands[id] = deck.splice(0, 7);
    // 첫 카드는 공격·특수 카드가 아닌 것으로
    let firstIdx = deck.findIndex((c) => {
      const p = parseCard(c);
      return !p.joker && p.rank >= 3 && p.rank <= 10 && p.rank !== 7;
    });
    if (firstIdx < 0) firstIdx = 0;
    const [first] = deck.splice(firstIdx, 1);
    const fc = parseCard(first);
    const state: OneCardState = {
      phase: 'playing',
      order,
      hands,
      deck,
      discard: [first],
      turn: 0,
      dir: 1,
      suit: fc.suit,
      rank: fc.rank,
      attack: 0,
      maxHand,
      winner: null,
      bankrupt: [],
      log: [`첫 카드: ${cardLabel(first)}`],
    };
    return state;
  },

  action(state, pid, action, ctx) {
    if (state.phase !== 'playing') return '게임이 끝났습니다.';
    const current = state.order[state.turn];
    if (action.type === 'forceDraw') {
      if (pid !== ctx.hostId) return '방장만 쓸 수 있습니다.';
      action = { type: 'draw' };
      pid = current;
    }
    if (pid !== current) return state.order.includes(pid) ? `지금은 ${nameOf(ctx, current)}님 차례입니다.` : '참가 중이 아닙니다.';
    const hand = state.hands[pid];

    if (action.type === 'draw') {
      const n = state.attack > 0 ? state.attack : 1;
      const got = draw(state, ctx, pid, n);
      log(state, state.attack > 0 ? `💥 ${nameOf(ctx, pid)}님이 공격을 받아 ${got}장을 먹었습니다.` : `${nameOf(ctx, pid)}님이 카드를 1장 가져갔습니다.`);
      state.attack = 0;
      if (checkBankrupt(state, ctx, pid)) return;
      advance(state);
      return;
    }

    if (action.type !== 'play') return '알 수 없는 행동입니다.';
    const card = String(action.card ?? '');
    const idx = hand.indexOf(card);
    if (idx < 0) return '그 카드는 손에 없습니다.';
    if (!canPlay(state, card)) return state.attack > 0 ? '공격을 받는 중입니다. 공격 카드로 막거나 카드를 먹으세요.' : '낼 수 없는 카드입니다.';
    const c = parseCard(card);
    let chosen: Suit | null = null;
    if (c.rank === 7) {
      chosen = action.suit as Suit;
      if (!SUITS.includes(chosen)) return '바꿀 무늬를 골라 주세요.';
    }

    hand.splice(idx, 1);
    state.discard.push(card);
    let text = `${nameOf(ctx, pid)}님: ${cardLabel(card)}`;

    const atk = attackValue(card);
    if (atk > 0) {
      state.attack += atk;
      text += ` (공격 +${atk}, 누적 ${state.attack}장)`;
    }
    if (c.joker) {
      state.suit = null;
      state.rank = null;
    } else {
      state.suit = chosen ?? c.suit;
      state.rank = c.rank;
    }
    if (chosen) text += ` → ${SUIT_NAME[chosen]}로 변경`;

    if (hand.length === 0) {
      log(state, text);
      finish(state, ctx, pid, '손패를 모두 털었습니다.');
      return;
    }
    if (hand.length === 1) {
      text += ' — 원카드!';
      ctx.announce(`☝️ ${nameOf(ctx, pid)}님 원카드!`);
    }

    if (c.rank === 11) {
      text += ' (다음 사람 건너뛰기)';
      log(state, text);
      advance(state, 2);
    } else if (c.rank === 12) {
      state.dir = state.dir === 1 ? -1 : 1;
      text += ' (방향 전환)';
      log(state, text);
      advance(state);
    } else if (c.rank === 13) {
      text += ' (한 번 더!)';
      log(state, text);
    } else {
      log(state, text);
      advance(state);
    }
  },

  view(state, viewerId) {
    const myHand = state.hands[viewerId] ? sortHand(state.hands[viewerId]) : null;
    const myTurn = state.phase === 'playing' && state.order[state.turn] === viewerId;
    return {
      phase: state.phase,
      seats: [...state.order, ...state.bankrupt],
      order: state.order,
      counts: Object.fromEntries(Object.entries(state.hands).map(([id, h]) => [id, h.length])),
      myHand,
      playable: myTurn && myHand ? myHand.filter((c) => canPlay(state, c)) : [],
      current: state.phase === 'playing' ? state.order[state.turn] : null,
      top: state.discard[state.discard.length - 1],
      suit: state.suit,
      attack: state.attack,
      dir: state.dir,
      deckCount: state.deck.length,
      maxHand: state.maxHand,
      winner: state.winner,
      bankrupt: state.bankrupt,
      log: state.log,
      // 끝나면 모두의 남은 카드를 공개
      reveal: state.phase === 'over' ? state.hands : null,
    };
  },

  onLeave(state, pid, ctx) {
    const idx = state.order.indexOf(pid);
    if (idx < 0 || state.phase !== 'playing') return;
    const wasCurrent = idx === state.turn;
    state.deck.unshift(...state.hands[pid]);
    state.hands[pid] = [];
    state.order.splice(idx, 1);
    log(state, `${nameOf(ctx, pid)}님이 나갔습니다.`);
    if (state.order.length === 1) {
      finish(state, ctx, state.order[0], '상대가 모두 나갔습니다.');
      return;
    }
    if (idx < state.turn || (wasCurrent && state.dir === -1)) state.turn--;
    state.turn = ((state.turn % state.order.length) + state.order.length) % state.order.length;
  },
};
