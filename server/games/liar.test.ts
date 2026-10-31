import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { drawing } from './drawing.ts';
import { liar } from './liar.ts';
import type { GameContext } from './types.ts';
import { DRAWING_WORDS, LIAR_CATEGORIES, parseCustomWords } from './words.ts';

function makeCtx(n: number): GameContext {
  const players = Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}` }));
  return { players, roomPlayers: players, hostId: 'p0', now: 0, random: Math.random, announce: () => {}, emit: () => {}, skipSync: () => {} };
}

/** 한 판을 끝내고 다음 판으로 넘긴다 (모두 아무에게나 투표 → 결과) */
function finishRound(s: any, ctx: GameContext) {
  for (const id of [...s.order]) liar.action(s, id, { type: 'hint', text: '힌트' }, ctx);
  liar.action(s, 'p0', { type: 'closeVote' }, ctx);
  if (s.phase === 'liarGuess') liar.action(s, s.liarId, { type: 'guess', word: '모름' }, ctx);
  assert.equal(s.phase, 'result');
  liar.action(s, 'p0', { type: 'next' }, ctx);
}

describe('제시어 목록', () => {
  it('주제가 충분히 많고 주제마다 단어가 충분하다', () => {
    const cats = Object.keys(LIAR_CATEGORIES);
    assert.ok(cats.length >= 15, `주제 ${cats.length}개`);
    for (const c of cats) assert.ok(LIAR_CATEGORIES[c].length >= 25, `${c}: ${LIAR_CATEGORIES[c].length}개`);
    for (const c of cats) assert.equal(new Set(LIAR_CATEGORIES[c]).size, LIAR_CATEGORIES[c].length, `${c}에 중복`);
    assert.ok(DRAWING_WORDS.length >= 150);
  });
  it('직접 입력한 단어를 나눈다 (쉼표, 줄바꿈, 띄어쓰기 있는 단어 유지)', () => {
    assert.deepEqual(parseCustomWords('민수, 지영\n수학 선생님,,민수 '), ['민수', '지영', '수학 선생님']);
  });
});

describe('라이어 게임 옵션', () => {
  it('우리끼리 제시어: 입력한 단어 중에서 나오고, 주제 이름이 보인다', () => {
    const ctx = makeCtx(3);
    const s = liar.setup(ctx, { category: 'custom', customTopic: '우리 반', customWords: '민수, 지영, 철수' });
    assert.equal(s.category, '우리 반');
    assert.ok(['민수', '지영', '철수'].includes(s.word));
  });
  it('우리끼리 제시어가 3개 미만이면 시작할 수 없다', () => {
    assert.throws(() => liar.setup(makeCtx(3), { category: 'custom', customWords: '하나, 둘' }), /3개 이상/);
  });
  it('같은 방에서 판을 이어가도 제시어가 반복되지 않는다', () => {
    const ctx = makeCtx(3);
    const s = liar.setup(ctx, { category: 'custom', customWords: '가, 나, 다, 라, 마' });
    const seen = [s.word];
    for (let i = 0; i < 4; i++) {
      finishRound(s, ctx);
      seen.push(s.word);
    }
    assert.equal(new Set(seen).size, 5, `나온 단어: ${seen.join(',')}`);
    // 다 쓰면 다시 처음부터
    finishRound(s, ctx);
    assert.ok(['가', '나', '다', '라', '마'].includes(s.word));
  });
  it('바보 모드: 라이어는 같은 주제의 다른 단어를 받고, 자기가 라이어인 줄 모른다', () => {
    const ctx = makeCtx(4);
    const s = liar.setup(ctx, { category: '동물', mode: 'fool' });
    const lv = liar.view(s, s.liarId, ctx) as { word: string; isLiar: boolean; foolWord: string | null };
    assert.equal(lv.isLiar, false);
    assert.notEqual(lv.word, s.word);
    assert.ok(LIAR_CATEGORIES['동물'].includes(lv.word));
    const citizen = s.order.find((id) => id !== s.liarId)!;
    const cv = liar.view(s, citizen, ctx) as { word: string; foolWord: string | null };
    assert.equal(cv.word, s.word);
    assert.equal(cv.foolWord, null);
    assert.ok(!JSON.stringify(cv).includes(`"${s.foolWord}"`));
    // 지목되면 그때 알게 된다
    for (const id of [...s.order]) liar.action(s, id, { type: 'hint', text: '힌트' }, ctx);
    for (const id of s.order) liar.action(s, id, { type: 'vote', target: id === s.liarId ? citizen : s.liarId }, ctx);
    assert.equal(s.phase, 'liarGuess');
    const lv2 = liar.view(s, s.liarId, ctx) as { isLiar: boolean };
    assert.equal(lv2.isLiar, true);
  });
});

describe('그림 맞추기 제시어', () => {
  it('우리끼리 단어만 쓰기', () => {
    const s = drawing.setup(makeCtx(2), { wordSet: 'custom', customWords: '우리 집 강아지, 담임선생님' });
    assert.ok(['우리 집 강아지', '담임선생님'].includes(s.word));
  });
  it('기본 + 우리끼리 단어 섞기', () => {
    const s = drawing.setup(makeCtx(2), { wordSet: 'mixed', customWords: '특별한단어' });
    assert.ok(s.pool.includes('특별한단어') && s.pool.length === DRAWING_WORDS.length + 1);
  });
});
