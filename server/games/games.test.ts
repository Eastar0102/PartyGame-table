import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { rollDice } from './dice.ts';
import { drawing } from './drawing.ts';
import { findWinLine, gomoku, SIZE } from './gomoku.ts';
import { liar } from './liar.ts';
import { mafia, roleCounts } from './mafia.ts';
import type { GameContext } from './types.ts';
import { applyDueum, validateWord, wordchain } from './wordchain.ts';

function makeCtx(n: number, overrides: Partial<GameContext> = {}): GameContext & { log: string[] } {
  const players = Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}` }));
  const log: string[] = [];
  return {
    players,
    roomPlayers: players,
    hostId: 'p0',
    now: 1_000_000,
    random: Math.random,
    announce: (t) => log.push(t),
    emit: () => {},
    skipSync: () => {},
    log,
    ...overrides,
  };
}

describe('주사위', () => {
  it('식을 계산한다', () => {
    const r = rollDice('2d6+3', () => 0.999);
    assert.equal(r.total, 15);
    assert.equal(r.detail, '[6, 6] + 3');
  });
  it('높은 값만 남긴다 (kh)', () => {
    const seq = [0, 0.5, 0.99, 0.2];
    let i = 0;
    const r = rollDice('4d6kh3', () => seq[i++]);
    // 굴린 값: 1, 4, 6, 2 → 높은 3개 6+4+2
    assert.equal(r.total, 12);
  });
  it('빼기와 여러 항을 지원한다', () => {
    assert.equal(rollDice('d20-2', () => 0).total, -1);
    assert.equal(rollDice('1d4+1d4', () => 0.999).total, 8);
  });
  it('잘못된 식은 거부한다', () => {
    assert.throws(() => rollDice('abc'));
    assert.throws(() => rollDice('1000d6'));
    assert.throws(() => rollDice('2d6+'));
    assert.throws(() => rollDice('d1'));
  });
});

describe('오목', () => {
  it('가로 다섯 개를 찾는다', () => {
    const board = Array(SIZE * SIZE).fill(0) as (0 | 1 | 2)[];
    for (let c = 3; c < 8; c++) board[7 * SIZE + c] = 1;
    assert.equal(findWinLine(board, 7 * SIZE + 5)?.length, 5);
    board[7 * SIZE + 7] = 0;
    assert.equal(findWinLine(board, 7 * SIZE + 5), null);
  });
  it('차례를 지키고 승자를 정한다', () => {
    const ctx = makeCtx(2);
    const s = gomoku.setup(ctx, {});
    const other = s.black === 'p0' ? 'p1' : 'p0';
    assert.ok(gomoku.action(s, other, { type: 'place', index: 0 }, ctx)); // 백이 먼저 둘 수 없음
    for (let i = 0; i < 4; i++) {
      assert.equal(gomoku.action(s, s.black, { type: 'place', index: i }, ctx), undefined);
      assert.equal(gomoku.action(s, s.white, { type: 'place', index: SIZE + i }, ctx), undefined);
    }
    gomoku.action(s, s.black, { type: 'place', index: 4 }, ctx);
    assert.equal(s.winner, s.black);
  });
});

describe('끝말잇기', () => {
  it('두음법칙', () => {
    assert.equal(applyDueum('력'), '역');
    assert.equal(applyDueum('락'), '낙');
    assert.equal(applyDueum('녀'), '여');
    assert.equal(applyDueum('류'), '유');
    assert.equal(applyDueum('가'), null);
  });
  it('단어 검사', () => {
    assert.equal(validateWord('역사', '능력', []), null);
    assert.equal(validateWord('력사', '능력', []), null);
    assert.ok(validateWord('사과', '능력', []));
    assert.ok(validateWord('사과', null, ['사과']));
    assert.ok(validateWord('a', null, []));
  });
  it('시간이 지나면 탈락하고 마지막 한 명이 우승', () => {
    const ctx = makeCtx(2);
    const s = wordchain.setup(ctx, { turnSeconds: 10 });
    const first = s.order[0];
    assert.equal(wordchain.action(s, first, { type: 'word', word: '사과' }, ctx), undefined);
    const second = s.order[1];
    assert.ok(wordchain.action(s, second, { type: 'word', word: '바나나' }, ctx));
    wordchain.tick!(s, { ...ctx, now: s.endsAt + 1 });
    assert.equal(s.phase, 'over');
    assert.equal(s.winner, first);
  });
});

describe('라이어 게임', () => {
  it('라이어에게는 제시어가 보이지 않는다', () => {
    const ctx = makeCtx(4);
    const s = liar.setup(ctx, {});
    const liarView = liar.view(s, s.liarId, ctx) as { word: string | null; isLiar: boolean };
    const citizen = s.order.find((id) => id !== s.liarId)!;
    const citizenView = liar.view(s, citizen, ctx) as { word: string | null };
    assert.equal(liarView.word, null);
    assert.equal(liarView.isLiar, true);
    assert.equal(citizenView.word, s.word);
  });
  it('설명 → 투표 → 라이어 지목 → 정답 맞히면 라이어 승리', () => {
    const ctx = makeCtx(3);
    const s = liar.setup(ctx, {});
    for (const id of [...s.order]) assert.equal(liar.action(s, id, { type: 'hint', text: '힌트' }, ctx), undefined);
    assert.equal(s.phase, 'vote');
    const citizens = s.order.filter((id) => id !== s.liarId);
    for (const id of citizens) liar.action(s, id, { type: 'vote', target: s.liarId }, ctx);
    liar.action(s, s.liarId, { type: 'vote', target: citizens[0] }, ctx);
    assert.equal(s.phase, 'liarGuess');
    liar.action(s, s.liarId, { type: 'guess', word: s.word }, ctx);
    assert.equal(s.result?.winner, 'liar');
  });
});

describe('마피아', () => {
  it('인원별 역할 수', () => {
    assert.deepEqual(roleCounts(4), { mafia: 1, police: 1, doctor: 0, citizen: 2 });
    assert.deepEqual(roleCounts(8), { mafia: 2, police: 1, doctor: 1, citizen: 4 });
    for (let n = 4; n <= 15; n++) assert.ok(roleCounts(n).citizen >= 1);
  });
  it('다른 사람의 역할은 보이지 않는다', () => {
    const ctx = makeCtx(6);
    const s = mafia.setup(ctx, {});
    const citizen = Object.keys(s.roles).find((id) => s.roles[id] === 'citizen')!;
    const v = mafia.view(s, citizen, ctx) as { visibleRoles: Record<string, string> };
    assert.deepEqual(Object.keys(v.visibleRoles), [citizen]);
  });
  it('밤에 의사가 살리면 아무도 죽지 않고, 마피아를 처형하면 시민 승리', () => {
    const ctx = makeCtx(5);
    const s = mafia.setup(ctx, {});
    const byRole = (r: string) => Object.keys(s.roles).find((id) => s.roles[id] === r)!;
    const m = byRole('mafia');
    const d = byRole('doctor');
    const p = byRole('police');
    const victim = byRole('citizen');
    mafia.action(s, m, { type: 'night', target: victim }, ctx);
    mafia.action(s, d, { type: 'night', target: victim }, ctx);
    mafia.action(s, p, { type: 'night', target: m }, ctx);
    assert.equal(s.phase, 'day');
    assert.equal(s.alive.length, 5);
    assert.equal(s.policeResults[0].isMafia, true);
    for (const id of s.alive) mafia.action(s, id, { type: 'vote', target: id === m ? victim : m }, ctx);
    assert.equal(s.phase, 'over');
    assert.equal(s.winner, 'citizens');
  });
});

describe('그림 맞추기', () => {
  it('정답을 맞히면 점수를 얻고, 모두 맞히면 차례가 끝난다', () => {
    const ctx = makeCtx(3);
    const s = drawing.setup(ctx, {});
    const guessers = s.players.filter((id) => id !== s.drawer);
    assert.ok(drawing.action(s, guessers[0], { type: 'stroke', color: '#000000', width: 3, points: [0, 0, 1, 1] }, ctx));
    assert.equal(drawing.action(s, s.drawer, { type: 'stroke', color: '#000000', width: 3, points: [0, 0, 1, 1] }, ctx), undefined);
    const hidden = drawing.view(s, guessers[0], ctx) as { word: string | null };
    assert.equal(hidden.word, null);
    drawing.action(s, guessers[0], { type: 'guess', text: '틀린답' }, ctx);
    drawing.action(s, guessers[0], { type: 'guess', text: s.word }, ctx);
    assert.ok(s.scores[guessers[0]] > 0);
    drawing.action(s, guessers[1], { type: 'guess', text: ` ${s.word} ` }, ctx);
    assert.equal(s.phase, 'reveal');
  });
});
