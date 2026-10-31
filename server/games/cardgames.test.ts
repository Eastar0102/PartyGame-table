import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { makeDeck, parseCard } from '../../shared/cards.ts';
import { blackjack, handValue } from './blackjack.ts';
import { oldmaid, removePairs } from './oldmaid.ts';
import { attackValue, canPlay, onecard } from './onecard.ts';
import type { GameContext } from './types.ts';

function makeCtx(n: number): GameContext {
  const players = Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}` }));
  return { players, roomPlayers: players, hostId: 'p0', now: 0, random: Math.random, announce: () => {}, emit: () => {}, skipSync: () => {} };
}

describe('카드', () => {
  it('덱은 52장 + 조커', () => {
    assert.equal(makeDeck().length, 52);
    assert.equal(new Set(makeDeck(['JB', 'JR'])).size, 54);
    assert.deepEqual(parseCard('H12'), { id: 'H12', suit: 'H', rank: 12, joker: null, red: true });
  });
});

describe('원카드', () => {
  it('무늬나 숫자가 같아야 낼 수 있다', () => {
    const st = { suit: 'S' as const, rank: 5, attack: 0 };
    assert.ok(canPlay(st, 'S9'));
    assert.ok(canPlay(st, 'H5'));
    assert.ok(!canPlay(st, 'H9'));
    assert.ok(canPlay(st, 'JR'));
  });
  it('공격 중에는 공격 카드로만 막는다', () => {
    const st = { suit: 'S' as const, rank: 2, attack: 2 };
    assert.ok(canPlay(st, 'S1'));
    assert.ok(canPlay(st, 'H2'));
    assert.ok(!canPlay(st, 'S9'));
    assert.ok(!canPlay(st, 'H1'));
    assert.equal(attackValue('S1'), 5);
    assert.equal(attackValue('JR'), 7);
  });
  it('공격을 못 막으면 쌓인 만큼 먹는다', () => {
    const ctx = makeCtx(2);
    const s = onecard.setup(ctx, {});
    const [a, b] = s.order;
    s.hands[a] = ['S2', 'H9', 'C4'];
    s.hands[b] = ['D8', 'C9'];
    s.suit = 'S';
    s.rank = 5;
    assert.equal(onecard.action(s, a, { type: 'play', card: 'S2' }, ctx), undefined);
    assert.equal(s.attack, 2);
    assert.ok(onecard.action(s, b, { type: 'play', card: 'D8' }, ctx)); // 공격 중이라 낼 수 없음
    onecard.action(s, b, { type: 'draw' }, ctx);
    assert.equal(s.hands[b].length, 4);
    assert.equal(s.attack, 0);
    assert.equal(s.order[s.turn], a);
  });
  it('7은 무늬를 바꾸고, K는 한 번 더, 마지막 카드를 내면 승리', () => {
    const ctx = makeCtx(2);
    const s = onecard.setup(ctx, {});
    const [a] = s.order;
    s.hands[a] = ['S7', 'H13', 'H4'];
    s.suit = 'S';
    s.rank = 3;
    assert.ok(onecard.action(s, a, { type: 'play', card: 'S7' }, ctx)); // 무늬 미선택
    onecard.action(s, a, { type: 'play', card: 'S7', suit: 'H' }, ctx);
    assert.equal(s.suit, 'H');
    s.turn = s.order.indexOf(a);
    onecard.action(s, a, { type: 'play', card: 'H13' }, ctx);
    assert.equal(s.order[s.turn], a);
    onecard.action(s, a, { type: 'play', card: 'H4' }, ctx);
    assert.equal(s.winner, a);
  });
  it('다른 사람 손패는 보이지 않는다', () => {
    const ctx = makeCtx(3);
    const s = onecard.setup(ctx, {});
    const v = onecard.view(s, 'p1', ctx) as { myHand: string[]; counts: Record<string, number> };
    assert.equal(v.myHand.length, 7);
    assert.equal(v.counts.p0, 7);
    assert.ok(!JSON.stringify(v).includes(JSON.stringify(s.hands.p0)));
  });
});

describe('도둑잡기', () => {
  it('같은 숫자 두 장씩 버린다', () => {
    const r = removePairs(['S3', 'H3', 'D3', 'C5', 'JB', 'H5']);
    assert.equal(r.pairs.length, 2);
    assert.deepEqual(r.hand.sort(), ['D3', 'JB'].sort());
  });
  it('끝까지 진행하면 조커를 든 사람이 진다', () => {
    const ctx = makeCtx(4);
    const s = oldmaid.setup(ctx, {});
    let guard = 0;
    while (s.phase === 'playing' && guard++ < 500) {
      const cur = s.order[s.turn];
      assert.equal(oldmaid.action(s, cur, { type: 'draw', index: 0 }, ctx), undefined);
    }
    assert.equal(s.phase, 'over');
    assert.ok(s.loser);
    assert.deepEqual(s.hands[s.loser!], ['JB']);
    // 카드는 사라지지 않는다: 짝 2장씩 + 조커 1장 = 53
    assert.equal(s.pairs.length * 2 + 1, 53);
  });
});

describe('블랙잭', () => {
  it('점수 계산 (A는 1 또는 11)', () => {
    assert.equal(handValue(['S1', 'H13']).total, 21);
    assert.equal(handValue(['S1', 'H1', 'D9']).total, 21);
    assert.equal(handValue(['S10', 'H9', 'D5']).total, 24);
    assert.deepEqual(handValue(['S1', 'H6']), { total: 17, soft: true });
  });
  it('베팅 → 진행 → 정산 후 칩이 맞게 바뀐다', () => {
    const ctx = makeCtx(2);
    const s = blackjack.setup(ctx, {});
    blackjack.action(s, 'p0', { type: 'bet', amount: 100 }, ctx);
    assert.equal(s.phase as string, 'betting');
    blackjack.action(s, 'p1', { type: 'bet', amount: 50 }, ctx);
    let guard = 0;
    while (s.phase === 'playing' && guard++ < 20) blackjack.action(s, s.order[s.turn], { type: 'stand' }, ctx);
    assert.equal(s.phase, 'settled');
    for (const id of ['p0', 'p1']) assert.equal(s.chips[id], 1000 + s.hands[id].payout);
    // 딜러는 17 이상이거나, 플레이어가 모두 버스트
    const view = blackjack.view(s, 'p0', ctx) as { dealer: (string | null)[] };
    assert.ok(view.dealer.every((c) => c));
  });
  it('진행 중에는 딜러의 두 번째 카드가 숨겨진다', () => {
    const ctx = makeCtx(1);
    for (let i = 0; i < 20; i++) {
      const s = blackjack.setup(ctx, {});
      blackjack.action(s, 'p0', { type: 'bet', amount: 10 }, ctx);
      if ((s.phase as string) !== 'playing') continue; // 딜러 블랙잭이면 바로 정산되므로 다시
      const v = blackjack.view(s, 'p0', ctx) as { dealer: (string | null)[] };
      assert.equal(v.dealer.length, 2);
      assert.equal(v.dealer[1], null);
      return;
    }
  });
});
