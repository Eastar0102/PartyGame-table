import { makeDeck, parseCard, type CardId } from '../../shared/cards.ts';
import { nameOf, shuffle, type GameContext, type GameModule } from './types.ts';

const START_CHIPS = 1000;
const REBUY_CHIPS = 500;
const MIN_BET = 10;

interface Hand {
  cards: CardId[];
  bet: number;
  stood: boolean;
  doubled: boolean;
  result: null | 'blackjack' | 'win' | 'push' | 'lose' | 'bust';
  payout: number; // 이번 판에 늘어나거나 줄어든 칩
}

interface BlackjackState {
  phase: 'betting' | 'playing' | 'settled';
  seats: string[];
  chips: Record<string, number>;
  bets: Record<string, number>; // 베팅 단계에서 건 금액
  hands: Record<string, Hand>;
  order: string[]; // 이번 판 참가자
  turn: number;
  dealer: CardId[];
  shoe: CardId[];
  round: number;
}

/** 블랙잭 점수: A는 11로 세다가 21을 넘으면 1로 */
export function handValue(cards: CardId[]): { total: number; soft: boolean } {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    const r = parseCard(c).rank;
    if (r === 1) {
      aces++;
      total += 11;
    } else total += Math.min(10, r);
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return { total, soft: aces > 0 };
}

const isBlackjack = (cards: CardId[]) => cards.length === 2 && handValue(cards).total === 21;

function drawCard(state: BlackjackState, ctx: GameContext): CardId {
  if (state.shoe.length === 0) state.shoe = shuffle([...makeDeck(), ...makeDeck()], ctx.random);
  return state.shoe.pop()!;
}

function deal(state: BlackjackState, ctx: GameContext) {
  // 카드가 적게 남았으면 새로 섞는다 (카드 2벌)
  if (state.shoe.length < 30) state.shoe = shuffle([...makeDeck(), ...makeDeck()], ctx.random);
  state.order = state.seats.filter((id) => (state.bets[id] ?? 0) > 0);
  state.hands = {};
  for (const id of state.order) {
    state.chips[id] -= state.bets[id];
    state.hands[id] = { cards: [], bet: state.bets[id], stood: false, doubled: false, result: null, payout: 0 };
  }
  state.dealer = [];
  for (let i = 0; i < 2; i++) {
    for (const id of state.order) state.hands[id].cards.push(drawCard(state, ctx));
    state.dealer.push(drawCard(state, ctx));
  }
  state.round++;
  state.phase = 'playing';
  state.turn = 0;
  if (isBlackjack(state.dealer)) {
    ctx.announce('🂡 딜러 블랙잭!');
    settle(state, ctx);
    return;
  }
  for (const id of state.order) if (isBlackjack(state.hands[id].cards)) state.hands[id].stood = true;
  moveToNext(state, ctx);
}

/** 아직 할 일이 남은 다음 사람으로. 모두 끝났으면 딜러 차례 후 정산 */
function moveToNext(state: BlackjackState, ctx: GameContext) {
  while (state.turn < state.order.length && state.hands[state.order[state.turn]].stood) state.turn++;
  if (state.turn >= state.order.length) settle(state, ctx);
}

function settle(state: BlackjackState, ctx: GameContext) {
  const anyAlive = state.order.some((id) => handValue(state.hands[id].cards).total <= 21);
  // 딜러는 17 이상이 될 때까지 뽑는다 (모두 버스트면 뽑지 않음)
  if (anyAlive && !isBlackjack(state.dealer)) {
    while (handValue(state.dealer).total < 17) state.dealer.push(drawCard(state, ctx));
  }
  const dealer = handValue(state.dealer).total;
  const dealerBJ = isBlackjack(state.dealer);
  const lines: string[] = [];
  for (const id of state.order) {
    const h = state.hands[id];
    const v = handValue(h.cards).total;
    let back = 0;
    if (v > 21) h.result = 'bust';
    else if (isBlackjack(h.cards) && !dealerBJ) {
      h.result = 'blackjack';
      back = h.bet + Math.floor(h.bet * 1.5);
    } else if (dealerBJ && !isBlackjack(h.cards)) h.result = 'lose';
    else if (dealer > 21 || v > dealer) {
      h.result = 'win';
      back = h.bet * 2;
    } else if (v === dealer) {
      h.result = 'push';
      back = h.bet;
    } else h.result = 'lose';
    state.chips[id] += back;
    h.payout = back - h.bet;
    lines.push(`${nameOf(ctx, id)} ${h.payout >= 0 ? '+' : ''}${h.payout}`);
  }
  state.phase = 'settled';
  state.turn = state.order.length;
  ctx.announce(`🂠 딜러 ${dealer > 21 ? '버스트' : dealer}점. ${lines.join(', ')}`);
}

export const blackjack: GameModule<BlackjackState> = {
  meta: {
    id: 'blackjack',
    name: '블랙잭',
    emoji: '🂡',
    description: `딜러(서버)를 상대로 21에 가깝게! 칩 ${START_CHIPS}개로 시작합니다. 히트·스탠드·더블다운, 블랙잭은 1.5배. 칩은 게임 안에서만 쓰는 점수입니다.`,
    minPlayers: 1,
    maxPlayers: 7,
  },

  setup(ctx) {
    const seats = ctx.players.map((p) => p.id);
    return {
      phase: 'betting',
      seats,
      chips: Object.fromEntries(seats.map((id) => [id, START_CHIPS])),
      bets: {},
      hands: {},
      order: [],
      turn: 0,
      dealer: [],
      shoe: shuffle([...makeDeck(), ...makeDeck()], ctx.random),
      round: 0,
    };
  },

  action(state, pid, action, ctx) {
    const seated = state.seats.includes(pid);
    switch (action.type) {
      case 'bet': {
        if (state.phase !== 'betting') return '지금은 베팅 시간이 아닙니다.';
        if (!seated) return '관전 중입니다.';
        const amount = Math.floor(Number(action.amount));
        if (!(amount >= MIN_BET)) return `최소 ${MIN_BET}개부터 걸 수 있습니다.`;
        if (amount > state.chips[pid]) return '칩이 부족합니다.';
        state.bets[pid] = amount;
        // 칩이 있는 사람이 모두 걸었으면 바로 시작
        if (state.seats.every((id) => state.chips[id] < MIN_BET || state.bets[id] > 0)) deal(state, ctx);
        return;
      }
      case 'deal': {
        if (pid !== ctx.hostId) return '방장만 바로 시작할 수 있습니다.';
        if (state.phase !== 'betting') return;
        if (!state.seats.some((id) => state.bets[id] > 0)) return '아직 아무도 걸지 않았습니다.';
        deal(state, ctx);
        return;
      }
      case 'hit':
      case 'stand':
      case 'double': {
        if (state.phase !== 'playing') return '지금은 행동할 수 없습니다.';
        const current = state.order[state.turn];
        if (pid !== current) return `지금은 ${nameOf(ctx, current)}님 차례입니다.`;
        const h = state.hands[pid];
        if (action.type === 'double') {
          if (h.cards.length !== 2) return '더블다운은 처음 두 장일 때만 할 수 있습니다.';
          if (state.chips[pid] < h.bet) return '칩이 부족합니다.';
          state.chips[pid] -= h.bet;
          h.bet *= 2;
          h.doubled = true;
          h.cards.push(drawCard(state, ctx));
          h.stood = true;
        } else if (action.type === 'hit') {
          h.cards.push(drawCard(state, ctx));
          if (handValue(h.cards).total >= 21) h.stood = true;
        } else {
          h.stood = true;
        }
        moveToNext(state, ctx);
        return;
      }
      case 'skip': {
        if (pid !== ctx.hostId) return '방장만 쓸 수 있습니다.';
        if (state.phase !== 'playing') return;
        state.hands[state.order[state.turn]].stood = true;
        moveToNext(state, ctx);
        return;
      }
      case 'next': {
        if (state.phase !== 'settled') return '아직 이번 판이 끝나지 않았습니다.';
        if (!seated && pid !== ctx.hostId) return '관전 중입니다.';
        state.phase = 'betting';
        state.bets = {};
        return;
      }
      case 'rebuy': {
        if (!seated) return '관전 중입니다.';
        if (state.chips[pid] >= MIN_BET) return '칩이 남아 있을 때는 충전할 수 없습니다.';
        state.chips[pid] += REBUY_CHIPS;
        ctx.announce(`💰 ${nameOf(ctx, pid)}님이 칩 ${REBUY_CHIPS}개를 충전했습니다.`);
        return;
      }
      default:
        return '알 수 없는 행동입니다.';
    }
  },

  view(state, viewerId) {
    const hideHole = state.phase === 'playing';
    const dealerCards = hideHole ? [state.dealer[0], null] : state.dealer;
    return {
      phase: state.phase,
      seats: state.seats,
      chips: state.chips,
      bets: state.bets,
      hands: Object.fromEntries(
        Object.entries(state.hands).map(([id, h]) => [id, { ...h, value: handValue(h.cards).total, soft: handValue(h.cards).soft }]),
      ),
      order: state.order,
      current: state.phase === 'playing' ? state.order[state.turn] : null,
      dealer: dealerCards,
      dealerValue: hideHole ? (state.dealer[0] ? handValue([state.dealer[0]]).total : 0) : handValue(state.dealer).total,
      round: state.round,
      minBet: MIN_BET,
      me: viewerId,
    };
  },

  onLeave(state, pid, ctx) {
    state.seats = state.seats.filter((id) => id !== pid);
    delete state.bets[pid];
    if (state.phase === 'playing' && state.hands[pid] && !state.hands[pid].stood) {
      state.hands[pid].stood = true;
      if (state.order[state.turn] === pid) moveToNext(state, ctx);
    }
    if (state.phase === 'betting' && state.seats.length && state.seats.every((id) => state.chips[id] < MIN_BET || state.bets[id] > 0) && state.seats.some((id) => state.bets[id] > 0)) {
      deal(state, ctx);
    }
  },
};
