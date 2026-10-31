import { makeDeck, parseCard, type CardId } from '../../shared/cards.ts';
import { nameOf, shuffle, type GameContext, type GameModule } from './types.ts';

interface OldMaidState {
  phase: 'playing' | 'over';
  order: string[]; // 아직 카드가 남은 사람 (차례 순서)
  hands: Record<string, CardId[]>; // 손패 순서가 곧 다른 사람이 뽑는 위치
  turn: number; // order 안에서 지금 뽑는 사람
  pairs: { id: string; cards: [CardId, CardId] }[];
  safe: string[]; // 다 털고 빠져나간 순서
  loser: string | null;
  lastDraw: null | { from: string; to: string; card: CardId; paired: boolean };
  seq: number;
}

/** 같은 숫자 두 장씩 짝지어 버린다. 버린 짝 목록을 돌려준다 */
export function removePairs(hand: CardId[]): { hand: CardId[]; pairs: [CardId, CardId][] } {
  const byRank = new Map<number, CardId[]>();
  const rest: CardId[] = [];
  for (const c of hand) {
    const p = parseCard(c);
    if (p.joker) {
      rest.push(c);
      continue;
    }
    byRank.set(p.rank, [...(byRank.get(p.rank) ?? []), c]);
  }
  const pairs: [CardId, CardId][] = [];
  for (const cards of byRank.values()) {
    while (cards.length >= 2) pairs.push([cards.shift()!, cards.shift()!]);
    rest.push(...cards);
  }
  // 원래 순서를 최대한 유지
  return { hand: hand.filter((c) => rest.includes(c)), pairs };
}

/**
 * 카드를 다 턴 사람을 빼고 다음 차례를 정한다.
 * advance가 true면 지금 사람의 다음 사람, false면 지금 사람(빠졌으면 그다음 사람)이 차례가 된다.
 */
function settle(state: OldMaidState, ctx: GameContext, advance: boolean) {
  const before = [...state.order];
  const current = before[state.turn];
  for (const id of before) {
    if (state.hands[id].length === 0) {
      state.order.splice(state.order.indexOf(id), 1);
      state.safe.push(id);
      ctx.announce(`🎉 ${nameOf(ctx, id)}님 탈출! (${state.safe.length}등)`);
    }
  }
  if (state.order.length <= 1) {
    state.phase = 'over';
    state.loser = state.order[0] ?? null;
    if (state.loser) ctx.announce(`🃏 조커는 ${nameOf(ctx, state.loser)}님에게! 도둑으로 잡혔습니다.`);
    return;
  }
  const start = before.indexOf(current);
  for (let k = advance ? 1 : 0; k <= before.length; k++) {
    const cand = before[(start + k) % before.length];
    if (state.order.includes(cand)) {
      state.turn = state.order.indexOf(cand);
      return;
    }
  }
}

export const oldmaid: GameModule<OldMaidState> = {
  meta: {
    id: 'oldmaid',
    name: '도둑잡기',
    emoji: '🃏',
    description: '조커 한 장을 섞어 나눠 갖고, 같은 숫자 두 장은 버립니다. 차례마다 다음 사람의 카드를 한 장 뽑아요. 마지막에 조커를 든 사람이 도둑!',
    minPlayers: 2,
    maxPlayers: 8,
  },

  setup(ctx) {
    const deck = shuffle(makeDeck(['JB']), ctx.random);
    const order = shuffle(ctx.players.map((p) => p.id), ctx.random);
    const hands: Record<string, CardId[]> = Object.fromEntries(order.map((id) => [id, [] as CardId[]]));
    deck.forEach((c, i) => hands[order[i % order.length]].push(c));
    const state: OldMaidState = { phase: 'playing', order, hands, turn: 0, pairs: [], safe: [], loser: null, lastDraw: null, seq: 0 };
    for (const id of order) {
      const r = removePairs(hands[id]);
      hands[id] = shuffle(r.hand, ctx.random);
      for (const p of r.pairs) state.pairs.push({ id, cards: p });
    }
    settle(state, ctx, false);
    return state;
  },

  action(state, pid, action, ctx) {
    if (action.type === 'shuffle') {
      if (!state.hands[pid]?.length) return;
      state.hands[pid] = shuffle(state.hands[pid], ctx.random);
      return;
    }
    if (action.type !== 'draw') return '알 수 없는 행동입니다.';
    if (state.phase !== 'playing') return '게임이 끝났습니다.';
    const current = state.order[state.turn];
    if (pid !== current) return state.order.includes(pid) ? `지금은 ${nameOf(ctx, current)}님 차례입니다.` : '참가 중이 아닙니다.';
    const target = state.order[(state.turn + 1) % state.order.length];
    const targetHand = state.hands[target];
    const index = Number(action.index);
    if (!Number.isInteger(index) || index < 0 || index >= targetHand.length) return '뽑을 카드를 골라 주세요.';

    const [card] = targetHand.splice(index, 1);
    const myHand = state.hands[pid];
    const p = parseCard(card);
    const matchIdx = p.joker ? -1 : myHand.findIndex((c) => parseCard(c).rank === p.rank);
    let paired = false;
    if (matchIdx >= 0) {
      const [match] = myHand.splice(matchIdx, 1);
      state.pairs.push({ id: pid, cards: [match, card] });
      paired = true;
    } else {
      // 뽑은 카드는 무작위 위치에 끼워 넣는다 (다른 사람이 위치를 추적하지 못하게)
      myHand.splice(Math.floor(ctx.random() * (myHand.length + 1)), 0, card);
    }
    state.lastDraw = { from: target, to: pid, card, paired };
    state.seq++;
    settle(state, ctx, true);
  },

  view(state, viewerId) {
    const current = state.phase === 'playing' ? state.order[state.turn] : null;
    const target = current ? state.order[(state.turn + 1) % state.order.length] : null;
    const ld = state.lastDraw;
    return {
      phase: state.phase,
      seats: Object.keys(state.hands),
      order: state.order,
      counts: Object.fromEntries(Object.entries(state.hands).map(([id, h]) => [id, h.length])),
      myHand: state.hands[viewerId] ?? null,
      current,
      target,
      pairs: state.pairs.slice(-12),
      pairCount: state.pairs.length,
      safe: state.safe,
      loser: state.loser,
      // 뽑은 카드는 뽑은 사람과 뽑힌 사람만 안다 (짝이 맞아 버려졌으면 모두 공개)
      lastDraw: ld ? { from: ld.from, to: ld.to, paired: ld.paired, card: ld.paired || ld.to === viewerId || ld.from === viewerId || state.phase === 'over' ? ld.card : null } : null,
      seq: state.seq,
    };
  },

  onLeave(state, pid, ctx) {
    const idx = state.order.indexOf(pid);
    if (idx < 0 || state.phase !== 'playing') return;
    // 나간 사람의 카드는 다음 사람에게 넘긴다 (조커가 사라지지 않도록)
    const next = state.order[(idx + 1) % state.order.length];
    if (next !== pid) {
      for (const c of state.hands[pid]) {
        const r = removePairs([...state.hands[next], c]);
        state.hands[next] = r.hand;
        for (const p of r.pairs) state.pairs.push({ id: next, cards: p });
      }
    }
    state.hands[pid] = [];
    state.order.splice(idx, 1);
    if (idx < state.turn) state.turn--;
    state.turn = state.order.length ? state.turn % state.order.length : 0;
    ctx.announce(`${nameOf(ctx, pid)}님의 카드는 ${nameOf(ctx, next)}님에게 넘어갔습니다.`);
    settle(state, ctx, false);
  },
};
