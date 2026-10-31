import { nameOf, pick, shuffle, tallyVotes, type GameContext, type GameModule } from './types.ts';
import { LIAR_CATEGORIES, parseCustomWords, similarWord } from './words.ts';

type Phase = 'hint' | 'vote' | 'liarGuess' | 'result';

interface LiarState {
  phase: Phase;
  category: string;
  word: string;
  liarId: string;
  order: string[];
  hintRounds: number;
  turn: number; // 지금까지 나온 설명 수
  hints: { id: string; text: string }[];
  votes: Record<string, string>;
  accused: string | null;
  voteCounts: Record<string, number>;
  liarGuess: string | null;
  result: null | { winner: 'liar' | 'citizens'; reason: string };
  scores: Record<string, number>;
  categoryOption: string;
  /** normal: 라이어는 제시어를 모름, fool: 라이어도 비슷한 다른 단어를 받아 자기가 라이어인 줄 모름 */
  mode: 'normal' | 'fool';
  foolWord: string | null;
  customTopic: string;
  customWords: string[];
  /** 이 방에서 이미 나온 제시어 (다 쓰면 다시 섞어서 처음부터) */
  used: string[];
}

const CUSTOM = 'custom';

interface RoundSettings {
  categoryOption: string;
  hintRounds: number;
  mode: 'normal' | 'fool';
  customTopic: string;
  customWords: string[];
}

function newRound(state: LiarState | null, ctx: GameContext, cfg: RoundSettings): LiarState {
  let category: string;
  let list: string[];
  if (cfg.categoryOption === CUSTOM) {
    category = cfg.customTopic || '우리끼리 제시어';
    list = cfg.customWords;
  } else {
    const categories = Object.keys(LIAR_CATEGORIES);
    category = categories.includes(cfg.categoryOption) ? cfg.categoryOption : pick(categories, ctx.random);
    list = LIAR_CATEGORIES[category];
  }
  // 이미 나온 단어는 빼고 고른다. 이 목록을 다 썼으면 이 목록만 다시 처음부터
  let used = state?.used ?? [];
  let fresh = list.filter((w) => !used.includes(w));
  if (fresh.length === 0) {
    used = used.filter((w) => !list.includes(w));
    fresh = list;
  }
  const word = pick(fresh, ctx.random);
  const alive = state ? [...state.order] : ctx.players.map((p) => p.id);
  return {
    phase: 'hint',
    category,
    word,
    liarId: pick(alive, ctx.random),
    order: shuffle(alive, ctx.random),
    hintRounds: cfg.hintRounds,
    turn: 0,
    hints: [],
    votes: {},
    accused: null,
    voteCounts: {},
    liarGuess: null,
    result: null,
    scores: state?.scores ?? Object.fromEntries(alive.map((id) => [id, 0])),
    categoryOption: cfg.categoryOption,
    mode: cfg.mode,
    foolWord: cfg.mode === 'fool' ? similarWord(category, word, list, ctx.random) : null,
    customTopic: cfg.customTopic,
    customWords: cfg.customWords,
    used: [...used, word],
  };
}

function finish(state: LiarState, ctx: GameContext, winner: 'liar' | 'citizens', reason: string) {
  state.phase = 'result';
  state.result = { winner, reason };
  if (winner === 'liar') state.scores[state.liarId] = (state.scores[state.liarId] ?? 0) + 2;
  else for (const id of state.order) if (id !== state.liarId) state.scores[id] = (state.scores[id] ?? 0) + 1;
  ctx.announce(`${winner === 'liar' ? '🤥 라이어 승리!' : '🙌 시민 승리!'} ${reason} (라이어: ${nameOf(ctx, state.liarId)}, 제시어: ${state.word})`);
}

function resolveVotes(state: LiarState, ctx: GameContext) {
  const { top, counts } = tallyVotes(state.votes);
  state.voteCounts = counts;
  state.accused = top;
  if (top === state.liarId) {
    state.phase = 'liarGuess';
    ctx.announce(
      state.mode === 'fool'
        ? `${nameOf(ctx, top)}님이 바로 라이어였습니다! (본인도 몰랐겠죠?) 진짜 제시어를 맞히면 역전승합니다.`
        : `라이어 ${nameOf(ctx, top)}님이 지목되었습니다! 라이어가 제시어를 맞히면 역전승합니다.`,
    );
  } else if (top === null) {
    finish(state, ctx, 'liar', '투표가 동점이라 아무도 지목되지 않았습니다.');
  } else {
    finish(state, ctx, 'liar', `${nameOf(ctx, top)}님은 라이어가 아니었습니다.`);
  }
}

export const liar: GameModule<LiarState> = {
  meta: {
    id: 'liar',
    name: '라이어 게임',
    emoji: '🤥',
    description:
      '한 명만 제시어를 모릅니다. 돌아가며 한 줄씩 설명하고 투표로 라이어를 찾아내세요. 지목된 라이어는 제시어를 맞히면 역전! 바보 모드에서는 라이어도 비슷한 다른 단어를 받아서 자기가 라이어인 줄 모릅니다.',
    minPlayers: 3,
    maxPlayers: 15,
    options: [
      {
        key: 'category',
        label: '주제',
        default: 'random',
        choices: [
          { value: 'random', label: '🎲 매 판 무작위' },
          ...Object.entries(LIAR_CATEGORIES).map(([c, words]) => ({ value: c, label: `${c} (${words.length})` })),
          { value: CUSTOM, label: '✏️ 우리끼리 제시어 (직접 입력)' },
        ],
      },
      { key: 'customTopic', label: '주제 이름', default: '', type: 'text', placeholder: '예: 우리 반 친구들, 같이 간 여행지', showIf: { key: 'category', value: CUSTOM } },
      {
        key: 'customWords',
        label: '제시어 (쉼표나 줄바꿈으로 구분, 3개 이상)',
        default: '',
        type: 'textarea',
        placeholder: '예: 민수, 지영, 철수, 수학 선생님\n또는 한 줄에 하나씩',
        showIf: { key: 'category', value: CUSTOM },
      },
      {
        key: 'mode',
        label: '모드',
        default: 'normal',
        choices: [
          { value: 'normal', label: '기본 (라이어는 제시어를 모름)' },
          { value: 'fool', label: '바보 모드 (라이어도 모름)' },
        ],
      },
      { key: 'hintRounds', label: '설명 바퀴 수', default: '1', choices: [{ value: '1', label: '1바퀴' }, { value: '2', label: '2바퀴' }] },
    ],
  },

  setup(ctx, options) {
    const categoryOption = String(options.category ?? 'random');
    const customWords = parseCustomWords(options.customWords);
    if (categoryOption === CUSTOM && customWords.length < 3) throw new Error('우리끼리 제시어는 3개 이상 입력해 주세요.');
    return newRound(null, ctx, {
      categoryOption,
      hintRounds: Number(options.hintRounds) === 2 ? 2 : 1,
      mode: options.mode === 'fool' ? 'fool' : 'normal',
      customTopic: String(options.customTopic ?? '').trim().slice(0, 30),
      customWords,
    });
  },

  action(state, pid, action, ctx) {
    const inGame = state.order.includes(pid);
    switch (action.type) {
      case 'hint': {
        if (state.phase !== 'hint') return '지금은 설명 차례가 아닙니다.';
        const current = state.order[state.turn % state.order.length];
        if (pid !== current) return `지금은 ${nameOf(ctx, current)}님 차례입니다.`;
        const text = String(action.text ?? '').trim().slice(0, 60);
        if (!text) return '설명을 입력해 주세요.';
        state.hints.push({ id: pid, text });
        state.turn++;
        if (state.turn >= state.order.length * state.hintRounds) {
          state.phase = 'vote';
          ctx.announce('설명이 끝났습니다. 라이어라고 생각하는 사람에게 투표하세요!');
        }
        return;
      }
      case 'skipHint': {
        if (pid !== ctx.hostId) return '방장만 차례를 넘길 수 있습니다.';
        if (state.phase !== 'hint') return;
        state.hints.push({ id: state.order[state.turn % state.order.length], text: '(넘어감)' });
        state.turn++;
        if (state.turn >= state.order.length * state.hintRounds) state.phase = 'vote';
        return;
      }
      case 'vote': {
        if (state.phase !== 'vote') return '지금은 투표 시간이 아닙니다.';
        if (!inGame) return '관전 중입니다.';
        const target = String(action.target ?? '');
        if (!state.order.includes(target)) return '그 사람에게는 투표할 수 없습니다.';
        if (target === pid) return '자기 자신에게는 투표할 수 없습니다.';
        state.votes[pid] = target;
        if (state.order.every((id) => state.votes[id])) resolveVotes(state, ctx);
        return;
      }
      case 'closeVote': {
        if (pid !== ctx.hostId) return '방장만 투표를 마감할 수 있습니다.';
        if (state.phase !== 'vote') return;
        resolveVotes(state, ctx);
        return;
      }
      case 'guess': {
        if (state.phase !== 'liarGuess') return '지금은 정답을 말할 때가 아닙니다.';
        if (pid !== state.liarId) return '라이어만 정답을 말할 수 있습니다.';
        const guess = String(action.word ?? '').trim().slice(0, 30);
        if (!guess) return '제시어를 입력해 주세요.';
        state.liarGuess = guess;
        if (guess.replace(/\s/g, '') === state.word.replace(/\s/g, '')) finish(state, ctx, 'liar', `라이어가 제시어 "${guess}"를 맞혔습니다!`);
        else finish(state, ctx, 'citizens', `라이어의 답 "${guess}"는 틀렸습니다.`);
        return;
      }
      case 'next': {
        if (pid !== ctx.hostId) return '방장만 다음 판을 시작할 수 있습니다.';
        if (state.phase !== 'result') return '아직 이번 판이 끝나지 않았습니다.';
        if (state.order.length < 3) return '3명 이상 남아 있어야 합니다.';
        Object.assign(state, newRound(state, ctx, state));
        ctx.announce(`새 판 시작! 주제는 "${state.category}"입니다.`);
        return;
      }
      default:
        return '알 수 없는 행동입니다.';
    }
  },

  view(state, viewerId) {
    const done = state.phase === 'result';
    const isLiar = viewerId === state.liarId;
    const inGame = state.order.includes(viewerId);
    // 바보 모드에서는 라이어가 지목되기 전까지 자기가 라이어인 줄 모르고, 비슷한 단어를 본다
    const liarKnows = state.mode === 'normal' || state.phase === 'liarGuess' || done;
    let word: string | null = null;
    if (done) word = state.word;
    else if (inGame && !isLiar) word = state.word;
    else if (inGame && isLiar && !liarKnows) word = state.foolWord;
    return {
      phase: state.phase,
      mode: state.mode,
      category: state.category,
      word,
      isLiar: inGame && isLiar && liarKnows,
      foolWord: done ? state.foolWord : null,
      liarId: done || state.phase === 'liarGuess' ? state.liarId : null,
      order: state.order,
      currentTurn: state.phase === 'hint' ? state.order[state.turn % state.order.length] : null,
      hintRound: Math.floor(state.turn / state.order.length) + 1,
      hintRounds: state.hintRounds,
      hints: state.hints,
      votedIds: Object.keys(state.votes),
      myVote: state.votes[viewerId] ?? null,
      votes: state.phase === 'vote' ? null : state.votes,
      voteCounts: state.voteCounts,
      accused: state.accused,
      liarGuess: state.liarGuess,
      result: state.result,
      scores: state.scores,
    };
  },

  onLeave(state, pid, ctx) {
    if (!state.order.includes(pid) || state.phase === 'result') {
      state.order = state.order.filter((id) => id !== pid);
      return;
    }
    if (pid === state.liarId) {
      finish(state, ctx, 'citizens', '라이어가 도망갔습니다!');
      state.order = state.order.filter((id) => id !== pid);
      return;
    }
    // 현재 설명 차례 계산이 꼬이지 않도록, 이번 바퀴에서 이미 설명한 사람이면 turn을 보정
    const idx = state.order.indexOf(pid);
    const posInRound = state.turn % state.order.length;
    const round = Math.floor(state.turn / state.order.length);
    state.order.splice(idx, 1);
    delete state.votes[pid];
    for (const [voter, target] of Object.entries(state.votes)) if (target === pid) delete state.votes[voter];
    if (state.phase === 'hint') {
      const newPos = idx < posInRound ? posInRound - 1 : posInRound;
      state.turn = round * state.order.length + Math.min(newPos, state.order.length);
      if (state.turn >= state.order.length * state.hintRounds) state.phase = 'vote';
    }
    if (state.order.length < 3) {
      finish(state, ctx, 'liar', '인원이 부족해서 게임을 이어갈 수 없습니다.');
      return;
    }
    if (state.phase === 'vote' && state.order.every((id) => state.votes[id])) resolveVotes(state, ctx);
  },
};
