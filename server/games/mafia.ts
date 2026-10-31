import { nameOf, shuffle, tallyVotes, type GameContext, type GameModule } from './types.ts';

export type Role = 'mafia' | 'doctor' | 'police' | 'citizen';

export const ROLE_NAMES: Record<Role, string> = { mafia: '마피아', doctor: '의사', police: '경찰', citizen: '시민' };

interface MafiaState {
  phase: 'night' | 'day' | 'over';
  day: number;
  roles: Record<string, Role>;
  alive: string[];
  mafiaVotes: Record<string, string>;
  doctorTarget: string | null;
  policeTarget: string | null;
  policeResults: { day: number; target: string; isMafia: boolean }[];
  dayVotes: Record<string, string>; // target id 또는 'skip'
  mafiaChat: { id: string; text: string }[];
  events: string[];
  winner: 'mafia' | 'citizens' | null;
}

export function roleCounts(n: number): Record<Role, number> {
  const mafia = n <= 5 ? 1 : n <= 8 ? 2 : n <= 12 ? 3 : 4;
  const police = n >= 4 ? 1 : 0;
  const doctor = n >= 5 ? 1 : 0;
  return { mafia, police, doctor, citizen: n - mafia - police - doctor };
}

function aliveWith(state: MafiaState, role: Role) {
  return state.alive.filter((id) => state.roles[id] === role);
}

function checkWinner(state: MafiaState, ctx: GameContext): boolean {
  const mafia = aliveWith(state, 'mafia').length;
  const others = state.alive.length - mafia;
  if (mafia === 0) state.winner = 'citizens';
  else if (mafia >= others) state.winner = 'mafia';
  if (!state.winner) return false;
  state.phase = 'over';
  const text = state.winner === 'mafia' ? '🔪 마피아 승리!' : '🙌 시민 승리!';
  state.events.push(text);
  ctx.announce(text);
  return true;
}

function nightReady(state: MafiaState): boolean {
  const mafia = aliveWith(state, 'mafia');
  if (!mafia.every((id) => state.mafiaVotes[id])) return false;
  if (aliveWith(state, 'doctor').length > 0 && !state.doctorTarget) return false;
  if (aliveWith(state, 'police').length > 0 && !state.policeTarget) return false;
  return true;
}

function resolveNight(state: MafiaState, ctx: GameContext) {
  // 마피아 투표가 갈리면 최다 득표자, 동점이면 그중 무작위
  const counts: Record<string, number> = {};
  for (const t of Object.values(state.mafiaVotes)) counts[t] = (counts[t] ?? 0) + 1;
  const best = Math.max(0, ...Object.values(counts));
  const tied = Object.keys(counts).filter((id) => counts[id] === best);
  const target = tied.length ? shuffle(tied, ctx.random)[0] : null;

  if (state.policeTarget) {
    state.policeResults.push({ day: state.day, target: state.policeTarget, isMafia: state.roles[state.policeTarget] === 'mafia' });
  }
  let msg: string;
  if (target && target !== state.doctorTarget) {
    state.alive = state.alive.filter((id) => id !== target);
    msg = `☀️ ${state.day}일째 아침: 밤사이 ${nameOf(ctx, target)}님이 마피아에게 당했습니다.`;
  } else if (target) {
    msg = `☀️ ${state.day}일째 아침: 의사가 누군가를 살려냈습니다! 아무도 죽지 않았습니다.`;
  } else {
    msg = `☀️ ${state.day}일째 아침: 조용한 밤이었습니다. 아무도 죽지 않았습니다.`;
  }
  state.events.push(msg);
  ctx.announce(msg);
  state.mafiaVotes = {};
  state.doctorTarget = null;
  state.policeTarget = null;
  if (checkWinner(state, ctx)) return;
  state.phase = 'day';
  state.dayVotes = {};
}

function resolveDay(state: MafiaState, ctx: GameContext) {
  const votes: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(state.dayVotes)) votes[k] = v === 'skip' ? null : v;
  const { top, counts } = tallyVotes(votes);
  const skips = Object.values(state.dayVotes).filter((v) => v === 'skip').length;
  let msg: string;
  if (top && counts[top] > skips) {
    state.alive = state.alive.filter((id) => id !== top);
    msg = `⚖️ 투표 결과 ${nameOf(ctx, top)}님이 처형되었습니다. 정체는 ${ROLE_NAMES[state.roles[top]]}였습니다.`;
  } else {
    msg = '⚖️ 투표 결과 아무도 처형되지 않았습니다.';
  }
  state.events.push(msg);
  ctx.announce(msg);
  state.dayVotes = {};
  if (checkWinner(state, ctx)) return;
  state.phase = 'night';
  state.day++;
  state.mafiaChat = [];
  ctx.announce(`🌙 ${state.day}번째 밤이 되었습니다. 마피아, 의사, 경찰은 행동을 고르세요.`);
}

export const mafia: GameModule<MafiaState> = {
  meta: {
    id: 'mafia',
    name: '마피아',
    emoji: '🕵️',
    description: '밤에는 마피아가 한 명을 노리고, 의사는 살리고, 경찰은 조사합니다. 낮에는 토론과 투표로 마피아를 찾아내세요. 사회자는 서버가 맡습니다.',
    minPlayers: 4,
    maxPlayers: 15,
  },

  setup(ctx) {
    const counts = roleCounts(ctx.players.length);
    const deck: Role[] = [];
    for (const role of ['mafia', 'police', 'doctor', 'citizen'] as Role[]) for (let i = 0; i < counts[role]; i++) deck.push(role);
    const shuffled = shuffle(deck, ctx.random);
    const roles: Record<string, Role> = {};
    ctx.players.forEach((p, i) => (roles[p.id] = shuffled[i]));
    const intro = `🌙 첫 번째 밤입니다. (마피아 ${counts.mafia}, 경찰 ${counts.police}, 의사 ${counts.doctor}, 시민 ${counts.citizen})`;
    ctx.announce(intro);
    return {
      phase: 'night',
      day: 1,
      roles,
      alive: ctx.players.map((p) => p.id),
      mafiaVotes: {},
      doctorTarget: null,
      policeTarget: null,
      policeResults: [],
      dayVotes: {},
      mafiaChat: [],
      events: [intro],
      winner: null,
    };
  },

  action(state, pid, action, ctx) {
    if (action.type === 'advance') {
      if (pid !== ctx.hostId) return '방장만 진행을 넘길 수 있습니다.';
      if (state.phase === 'night') resolveNight(state, ctx);
      else if (state.phase === 'day') resolveDay(state, ctx);
      return;
    }
    if (state.phase === 'over') return '게임이 끝났습니다.';
    if (!state.alive.includes(pid)) return state.roles[pid] ? '죽은 사람은 행동할 수 없습니다.' : '관전 중입니다.';
    const role = state.roles[pid];
    const target = String(action.target ?? '');
    const validTarget = state.alive.includes(target);

    switch (action.type) {
      case 'night': {
        if (state.phase !== 'night') return '지금은 밤이 아닙니다.';
        if (!validTarget) return '살아 있는 사람을 골라 주세요.';
        if (role === 'mafia') {
          if (state.roles[target] === 'mafia') return '같은 마피아는 고를 수 없습니다.';
          state.mafiaVotes[pid] = target;
        } else if (role === 'doctor') {
          state.doctorTarget = target;
        } else if (role === 'police') {
          if (target === pid) return '자기 자신은 조사할 수 없습니다.';
          if (state.policeTarget) return '오늘 밤은 이미 조사했습니다.';
          state.policeTarget = target;
        } else {
          return '시민은 밤에 할 일이 없습니다. 푹 주무세요 😴';
        }
        if (nightReady(state)) resolveNight(state, ctx);
        return;
      }
      case 'mafiaChat': {
        if (role !== 'mafia') return '마피아만 쓸 수 있습니다.';
        const text = String(action.text ?? '').trim().slice(0, 200);
        if (!text) return;
        state.mafiaChat.push({ id: pid, text });
        if (state.mafiaChat.length > 100) state.mafiaChat.shift();
        return;
      }
      case 'vote': {
        if (state.phase !== 'day') return '지금은 투표 시간이 아닙니다.';
        if (target !== 'skip' && !validTarget) return '살아 있는 사람을 골라 주세요.';
        state.dayVotes[pid] = target;
        if (state.alive.every((id) => state.dayVotes[id])) resolveDay(state, ctx);
        return;
      }
      default:
        return '알 수 없는 행동입니다.';
    }
  },

  view(state, viewerId) {
    const over = state.phase === 'over';
    const myRole = state.roles[viewerId] ?? null;
    const amMafia = myRole === 'mafia';
    const visibleRoles: Record<string, Role> = {};
    for (const [id, role] of Object.entries(state.roles)) {
      // 끝났거나, 본인이거나, 같은 마피아끼리만 역할을 보여준다 (처형된 사람의 정체는 이벤트 기록으로 공개)
      if (over || id === viewerId || (amMafia && role === 'mafia')) visibleRoles[id] = role;
    }
    const night = state.phase === 'night';
    let myNightTarget: string | null = null;
    if (myRole === 'mafia') myNightTarget = state.mafiaVotes[viewerId] ?? null;
    if (myRole === 'doctor') myNightTarget = state.doctorTarget;
    if (myRole === 'police') myNightTarget = state.policeTarget;
    return {
      phase: state.phase,
      day: state.day,
      myRole,
      alive: state.alive,
      players: Object.keys(state.roles),
      visibleRoles,
      myNightTarget: night ? myNightTarget : null,
      mafiaVotes: amMafia && night ? state.mafiaVotes : null,
      mafiaChat: amMafia ? state.mafiaChat : null,
      policeResults: myRole === 'police' || over ? state.policeResults : null,
      dayVotes: state.phase === 'day' ? state.dayVotes : {},
      events: state.events,
      winner: state.winner,
    };
  },

  onLeave(state, pid, ctx) {
    if (!state.alive.includes(pid) || state.phase === 'over') return;
    state.alive = state.alive.filter((id) => id !== pid);
    delete state.mafiaVotes[pid];
    delete state.dayVotes[pid];
    const msg = `${nameOf(ctx, pid)}님이 게임을 떠났습니다.`;
    state.events.push(msg);
    if (checkWinner(state, ctx)) return;
    if (state.phase === 'night' && nightReady(state)) resolveNight(state, ctx);
    else if (state.phase === 'day' && state.alive.every((id) => state.dayVotes[id])) resolveDay(state, ctx);
  },
};
