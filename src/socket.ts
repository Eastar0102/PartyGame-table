import { io, type Socket } from 'socket.io-client';
import type { Ack, ClientToServerEvents, ServerToClientEvents } from '../shared/types.ts';

export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io({ autoConnect: true });

/** 브라우저마다 고정된 비밀 토큰. 새로고침해도 같은 사람으로 인식된다 */
export function getToken(): string {
  let t = localStorage.getItem('pgt-token');
  if (!t) {
    t = crypto.randomUUID() + crypto.randomUUID();
    localStorage.setItem('pgt-token', t);
  }
  return t;
}

type AckResult<T> = Parameters<Ack<T>>[0];

/** ack 콜백을 Promise로 감싼다 */
export function request<T = {}>(fn: (ack: Ack<T>) => void, timeoutMs = 8000): Promise<AckResult<T>> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ ok: false, error: '서버 응답이 없습니다.' }), timeoutMs);
    fn((res) => {
      clearTimeout(timer);
      resolve(res);
    });
  });
}

export type GameAction = { type: string; [k: string]: unknown };

let errorHandler: (msg: string) => void = () => {};
export function onActionError(fn: (msg: string) => void) {
  errorHandler = fn;
}

/** 게임 행동을 보내고, 실패하면 화면에 오류를 띄운다. 성공하면 true */
export async function act(action: GameAction): Promise<boolean> {
  const res = await request((ack) => socket.emit('game:action', action, ack));
  if (!res.ok) errorHandler(res.error);
  return res.ok;
}

/** 획처럼 응답을 기다릴 필요 없는 빠른 행동 */
export function actFast(action: GameAction) {
  socket.emit('game:action', action);
}
