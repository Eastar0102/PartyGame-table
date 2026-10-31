import type { GameMeta } from '../../shared/types.ts';

export interface GamePlayer {
  id: string;
  name: string;
}

/** 게임 모듈이 방(Room)과 상호작용하는 통로 */
export interface GameContext {
  /** 게임 시작 시점의 참가자 (관전자는 제외) */
  players: GamePlayer[];
  /** 현재 방에 있는 모든 사람 (관전자 포함) */
  roomPlayers: GamePlayer[];
  hostId: string;
  now: number;
  random: () => number;
  /** 채팅창에 시스템 메시지를 남긴다 */
  announce: (text: string) => void;
  /** 상태 전체 동기화 없이 방 전체에 가벼운 이벤트를 보낸다 */
  emit: (event: { type: string; [k: string]: unknown }) => void;
  /** 이번 액션 뒤에는 상태 동기화를 하지 않는다 (emit만으로 충분할 때) */
  skipSync: () => void;
}

export interface GameModule<S = any> {
  meta: GameMeta;
  setup(ctx: GameContext, options: Record<string, unknown>): S;
  /** 액션을 처리하고 state를 직접 수정한다. 문제가 있으면 오류 메시지를 반환 */
  action(state: S, playerId: string, action: { type: string; [k: string]: unknown }, ctx: GameContext): string | void;
  /** 특정 사람에게 보여줄 상태 (비밀 정보를 걸러낸다) */
  view(state: S, viewerId: string, ctx: GameContext): unknown;
  /** 1초마다 호출된다. 상태가 바뀌었으면 true */
  tick?(state: S, ctx: GameContext): boolean;
  /** 참가자가 방을 나갔을 때 */
  onLeave?(state: S, playerId: string, ctx: GameContext): void;
}

export function shuffle<T>(arr: T[], random: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function pick<T>(arr: T[], random: () => number): T {
  return arr[Math.floor(random() * arr.length)];
}

export function nameOf(ctx: GameContext, id: string): string {
  return ctx.players.find((p) => p.id === id)?.name ?? ctx.roomPlayers.find((p) => p.id === id)?.name ?? '???';
}

/** 투표 집계: 최다 득표자가 한 명이면 그 id, 동점이거나 표가 없으면 null */
export function tallyVotes(votes: Record<string, string | null>): { top: string | null; counts: Record<string, number> } {
  const counts: Record<string, number> = {};
  for (const target of Object.values(votes)) {
    if (target) counts[target] = (counts[target] ?? 0) + 1;
  }
  let top: string | null = null;
  let best = 0;
  let tie = false;
  for (const [id, n] of Object.entries(counts)) {
    if (n > best) {
      best = n;
      top = id;
      tie = false;
    } else if (n === best) {
      tie = true;
    }
  }
  return { top: tie ? null : top, counts };
}
