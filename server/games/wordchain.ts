import { nameOf, shuffle, type GameContext, type GameModule } from './types.ts';

interface WordChainState {
  phase: 'playing' | 'over';
  order: string[]; // 살아 있는 사람 (차례 순서)
  turn: number; // order 안에서 현재 차례 위치
  words: { id: string; word: string }[];
  eliminated: string[];
  turnSeconds: number;
  endsAt: number;
  winner: string | null;
}

const HANGUL_START = 0xac00;
const HANGUL_END = 0xd7a3;

/** 두음법칙을 적용한 글자 (적용되지 않으면 null). 예: 력→역, 락→낙, 녀→여 */
export function applyDueum(ch: string): string | null {
  const code = ch.charCodeAt(0);
  if (code < HANGUL_START || code > HANGUL_END) return null;
  const offset = code - HANGUL_START;
  const initial = Math.floor(offset / 588);
  const medial = Math.floor((offset % 588) / 28);
  const final = offset % 28;
  const RIEUL = 5;
  const NIEUN = 2;
  const IEUNG = 11;
  const toIeung = [2, 6, 7, 12, 17, 20]; // ㅑ ㅕ ㅖ ㅛ ㅠ ㅣ
  const toNieun = [0, 1, 8, 11, 13, 18]; // ㅏ ㅐ ㅗ ㅚ ㅜ ㅡ
  let next: number | null = null;
  if (initial === RIEUL && toIeung.includes(medial)) next = IEUNG;
  else if (initial === RIEUL && toNieun.includes(medial)) next = NIEUN;
  else if (initial === NIEUN && toIeung.includes(medial)) next = IEUNG;
  if (next === null) return null;
  return String.fromCharCode(HANGUL_START + next * 588 + medial * 28 + final);
}

/** 앞 단어 다음에 올 수 있는 첫 글자 목록 */
export function allowedStarts(prevWord: string): string[] {
  const last = prevWord[prevWord.length - 1];
  const alt = applyDueum(last);
  return alt ? [last, alt] : [last];
}

export function validateWord(word: string, prevWord: string | null, used: string[]): string | null {
  if (!/^[가-힣]+$/.test(word)) return '한글 단어만 쓸 수 있습니다.';
  if (word.length < 2) return '두 글자 이상이어야 합니다.';
  if (word.length > 15) return '너무 긴 단어입니다.';
  if (used.includes(word)) return '이미 나온 단어입니다.';
  if (prevWord) {
    const starts = allowedStarts(prevWord);
    if (!starts.includes(word[0])) return `"${starts.join('" 또는 "')}"(으)로 시작해야 합니다.`;
  }
  return null;
}

/** 이어갈 단어. 탈락이 생기면 빈 구분자('')가 들어가서 다음 사람은 아무 단어로나 시작한다 */
function chainWord(state: WordChainState): string | null {
  return state.words.length ? state.words[state.words.length - 1].word : null;
}

function eliminate(state: WordChainState, ctx: GameContext, pid: string, reason: string) {
  const idx = state.order.indexOf(pid);
  if (idx < 0) return;
  state.order.splice(idx, 1);
  state.eliminated.push(pid);
  ctx.announce(`💥 ${nameOf(ctx, pid)}님 탈락! (${reason})`);
  // 탈락하면 다음 사람이 아무 단어로나 새로 시작한다
  state.words.push({ id: '', word: '' });
  if (state.order.length <= 1) {
    state.phase = 'over';
    state.winner = state.order[0] ?? null;
    if (state.winner) ctx.announce(`🏆 끝말잇기 우승: ${nameOf(ctx, state.winner)}님!`);
    return;
  }
  if (idx < state.turn) state.turn--;
  state.turn %= state.order.length;
  state.endsAt = ctx.now + state.turnSeconds * 1000;
}

export const wordchain: GameModule<WordChainState> = {
  meta: {
    id: 'wordchain',
    name: '끝말잇기',
    emoji: '🔤',
    description: '앞 단어의 끝 글자로 시작하는 단어를 제한 시간 안에 말하세요. 두음법칙 허용(력→역). 시간이 지나면 탈락, 마지막 한 명이 우승!',
    minPlayers: 2,
    maxPlayers: 15,
  },

  setup(ctx, options) {
    const turnSeconds = [10, 15, 20, 30].includes(Number(options.turnSeconds)) ? Number(options.turnSeconds) : 15;
    return {
      phase: 'playing',
      order: shuffle(ctx.players.map((p) => p.id), ctx.random),
      turn: 0,
      words: [],
      eliminated: [],
      turnSeconds,
      endsAt: ctx.now + turnSeconds * 1000 + 3000,
      winner: null,
    };
  },

  action(state, pid, action, ctx) {
    if (action.type === 'reject') {
      // 사전에 없는 단어를 썼을 때 방장이 판정해서 되돌린다
      if (pid !== ctx.hostId) return '방장만 단어를 무효로 할 수 있습니다.';
      const last = state.words[state.words.length - 1];
      if (state.phase !== 'playing' || !last?.id) return '무효로 할 단어가 없습니다.';
      state.words.pop();
      const author = last.id;
      // 탈락 처리 후 그 사람 다음 차례로 넘어간다
      state.turn = state.order.indexOf(author);
      eliminate(state, ctx, author, `"${last.word}"는 인정되지 않았습니다`);
      return;
    }
    if (action.type !== 'word') return '알 수 없는 행동입니다.';
    if (state.phase !== 'playing') return '게임이 끝났습니다.';
    const current = state.order[state.turn];
    if (pid !== current) return state.order.includes(pid) ? `지금은 ${nameOf(ctx, current)}님 차례입니다.` : '참가 중이 아닙니다.';
    const word = String(action.word ?? '').trim();
    const prev = chainWord(state);
    const used = state.words.map((w) => w.word);
    const err = validateWord(word, prev || null, used);
    if (err) return err;
    state.words.push({ id: pid, word });
    state.turn = (state.turn + 1) % state.order.length;
    state.endsAt = ctx.now + state.turnSeconds * 1000;
  },

  tick(state, ctx) {
    if (state.phase !== 'playing' || ctx.now < state.endsAt) return false;
    eliminate(state, ctx, state.order[state.turn], '시간 초과');
    return true;
  },

  view(state) {
    const prev = chainWord(state);
    return {
      phase: state.phase,
      order: state.order,
      current: state.phase === 'playing' ? state.order[state.turn] : null,
      words: state.words,
      nextStarts: prev ? allowedStarts(prev) : null,
      eliminated: state.eliminated,
      endsAt: state.endsAt,
      turnSeconds: state.turnSeconds,
      winner: state.winner,
    };
  },

  onLeave(state, pid, ctx) {
    if (state.phase === 'playing' && state.order.includes(pid)) eliminate(state, ctx, pid, '나감');
  },
};
