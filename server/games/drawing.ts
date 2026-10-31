import { nameOf, shuffle, type GameContext, type GameModule } from './types.ts';
import { DRAWING_WORDS } from './words.ts';

export interface Stroke {
  color: string;
  width: number;
  /** 0~1로 정규화된 [x0, y0, x1, y1, ...] 좌표 */
  points: number[];
}

interface DrawingState {
  phase: 'drawing' | 'reveal' | 'over';
  queue: string[]; // 앞으로 그릴 사람 순서
  turnNo: number;
  totalTurns: number;
  drawer: string;
  word: string;
  usedWords: string[];
  strokes: Stroke[];
  guessed: string[];
  feed: { id: string; text: string; correct?: boolean }[];
  scores: Record<string, number>;
  turnSeconds: number;
  startedAt: number;
  endsAt: number;
  revealUntil: number;
  players: string[];
  hintShown: boolean;
}

const REVEAL_MS = 5000;
const MAX_STROKES = 4000;
const COLOR_RE = /^#[0-9a-f]{6}$/i;

const normalize = (s: string) => s.replace(/\s/g, '').toLowerCase();

function startTurn(state: DrawingState, ctx: GameContext) {
  const drawer = state.queue.shift();
  if (!drawer) {
    state.phase = 'over';
    const ranking = [...state.players].sort((a, b) => (state.scores[b] ?? 0) - (state.scores[a] ?? 0));
    ctx.announce(`🏁 그림 맞추기 끝! 1등은 ${nameOf(ctx, ranking[0])}님 (${state.scores[ranking[0]] ?? 0}점)`);
    return;
  }
  const remaining = DRAWING_WORDS.filter((w) => !state.usedWords.includes(w));
  const word = shuffle(remaining.length ? remaining : DRAWING_WORDS, ctx.random)[0];
  state.usedWords.push(word);
  Object.assign(state, {
    phase: 'drawing',
    drawer,
    word,
    strokes: [],
    guessed: [],
    feed: [],
    turnNo: state.turnNo + 1,
    hintShown: false,
    startedAt: ctx.now,
    endsAt: ctx.now + state.turnSeconds * 1000,
  });
  ctx.emit({ type: 'draw:clear' });
  ctx.announce(`✏️ ${state.turnNo}/${state.totalTurns}번째 그림: ${nameOf(ctx, drawer)}님이 그립니다.`);
}

function endTurn(state: DrawingState, ctx: GameContext, reason: string) {
  state.phase = 'reveal';
  state.revealUntil = ctx.now + REVEAL_MS;
  ctx.announce(`${reason} 정답은 "${state.word}"였습니다.`);
}

export const drawing: GameModule<DrawingState> = {
  meta: {
    id: 'drawing',
    name: '그림 맞추기',
    emoji: '🎨',
    description: '한 사람이 제시어를 그리고 나머지가 맞힙니다. 빨리 맞힐수록 점수가 높고, 맞힌 사람이 많을수록 그린 사람도 점수를 받습니다.',
    minPlayers: 2,
    maxPlayers: 15,
  },

  setup(ctx, options) {
    const rounds = Math.max(1, Math.min(3, Number(options.rounds) || 1));
    const turnSeconds = [60, 80, 100].includes(Number(options.turnSeconds)) ? Number(options.turnSeconds) : 80;
    const ids = ctx.players.map((p) => p.id);
    const queue: string[] = [];
    for (let r = 0; r < rounds; r++) queue.push(...shuffle(ids, ctx.random));
    const state: DrawingState = {
      phase: 'drawing',
      queue,
      turnNo: 0,
      totalTurns: queue.length,
      drawer: '',
      word: '',
      usedWords: [],
      strokes: [],
      guessed: [],
      feed: [],
      scores: Object.fromEntries(ids.map((id) => [id, 0])),
      turnSeconds,
      startedAt: 0,
      endsAt: 0,
      revealUntil: 0,
      players: ids,
      hintShown: false,
    };
    startTurn(state, ctx);
    return state;
  },

  action(state, pid, action, ctx) {
    const isDrawer = pid === state.drawer && state.phase === 'drawing';
    switch (action.type) {
      case 'stroke': {
        if (!isDrawer) return '지금은 그릴 수 없습니다.';
        const color = String(action.color ?? '');
        const width = Number(action.width);
        const points = action.points;
        if (!COLOR_RE.test(color) || !(width >= 1 && width <= 40)) return '잘못된 붓 설정입니다.';
        if (!Array.isArray(points) || points.length < 2 || points.length > 400 || points.length % 2 !== 0) return '잘못된 획입니다.';
        if (!points.every((v) => typeof v === 'number' && v >= -0.05 && v <= 1.05)) return '잘못된 좌표입니다.';
        if (state.strokes.length >= MAX_STROKES) return '더 이상 그릴 수 없습니다. 지우고 다시 그려 주세요.';
        const stroke: Stroke = { color, width, points: points.map((v: number) => Math.round(v * 10000) / 10000) };
        state.strokes.push(stroke);
        ctx.emit({ type: 'draw:stroke', stroke });
        ctx.skipSync();
        return;
      }
      case 'clear':
        if (!isDrawer) return '지금은 그릴 수 없습니다.';
        state.strokes = [];
        ctx.emit({ type: 'draw:clear' });
        ctx.skipSync();
        return;
      case 'undo': {
        if (!isDrawer) return '지금은 그릴 수 없습니다.';
        // 한 번에 그은 획은 여러 조각으로 나뉘어 오므로, 클라이언트가 보낸 조각 수만큼 되돌린다
        const n = Math.max(1, Math.min(200, Number(action.count) || 1));
        state.strokes.splice(Math.max(0, state.strokes.length - n));
        ctx.emit({ type: 'draw:replace', strokes: state.strokes });
        ctx.skipSync();
        return;
      }
      case 'guess': {
        if (state.phase !== 'drawing') return '지금은 맞힐 수 없습니다.';
        if (!state.players.includes(pid)) return '관전 중입니다.';
        if (pid === state.drawer) return '그리는 사람은 맞힐 수 없습니다.';
        if (state.guessed.includes(pid)) return '이미 맞혔습니다!';
        const text = String(action.text ?? '').trim().slice(0, 30);
        if (!text) return;
        if (normalize(text) === normalize(state.word)) {
          const remain = Math.max(0, state.endsAt - ctx.now) / (state.turnSeconds * 1000);
          const points = 50 + Math.round(remain * 50) - state.guessed.length * 5;
          state.scores[pid] = (state.scores[pid] ?? 0) + Math.max(20, points);
          state.scores[state.drawer] = (state.scores[state.drawer] ?? 0) + 20;
          state.guessed.push(pid);
          state.feed.push({ id: pid, text: '정답!', correct: true });
          const guessers = state.players.filter((id) => id !== state.drawer);
          if (guessers.every((id) => state.guessed.includes(id))) endTurn(state, ctx, '🎉 모두 맞혔습니다!');
        } else {
          state.feed.push({ id: pid, text });
          if (state.feed.length > 80) state.feed.shift();
        }
        return;
      }
      case 'skip':
        if (state.phase !== 'drawing') return;
        if (pid !== state.drawer && pid !== ctx.hostId) return '그리는 사람이나 방장만 넘길 수 있습니다.';
        endTurn(state, ctx, '⏭️ 이번 그림은 넘어갑니다.');
        return;
      default:
        return '알 수 없는 행동입니다.';
    }
  },

  tick(state, ctx) {
    if (state.phase === 'drawing' && ctx.now >= state.endsAt) {
      endTurn(state, ctx, '⏰ 시간 종료!');
      return true;
    }
    if (state.phase === 'drawing' && !state.hintShown && ctx.now - state.startedAt > (state.turnSeconds * 1000) / 2) {
      state.hintShown = true;
      return true;
    }
    if (state.phase === 'reveal' && ctx.now >= state.revealUntil) {
      startTurn(state, ctx);
      return true;
    }
    return false;
  },

  view(state, viewerId) {
    const canSeeWord = state.phase !== 'drawing' || viewerId === state.drawer || state.guessed.includes(viewerId);
    // 시간이 절반 지나면 첫 글자를 힌트로 보여준다
    const hint = [...state.word].map((ch, i) => (ch === ' ' ? ' ' : state.hintShown && i === 0 ? ch : '○')).join('');
    return {
      phase: state.phase,
      drawer: state.drawer,
      word: canSeeWord ? state.word : null,
      hint,
      strokes: state.strokes,
      guessed: state.guessed,
      feed: state.feed,
      scores: state.scores,
      endsAt: state.endsAt,
      turnNo: state.turnNo,
      totalTurns: state.totalTurns,
      players: state.players,
    };
  },

  onLeave(state, pid, ctx) {
    state.players = state.players.filter((id) => id !== pid);
    state.queue = state.queue.filter((id) => id !== pid);
    if (state.phase === 'drawing' && pid === state.drawer) endTurn(state, ctx, '그리던 사람이 나갔습니다.');
    if (state.players.length < 2 && state.phase !== 'over') {
      state.queue = [];
      state.phase = 'over';
      ctx.announce('인원이 부족해서 그림 맞추기를 마칩니다.');
    }
  },
};
