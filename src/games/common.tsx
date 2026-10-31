import { useEffect, useState } from 'react';
import type { RoomState } from '../../shared/types.ts';

export interface GameProps<V = any> {
  view: V;
  room: RoomState;
}

export function useNames(room: RoomState) {
  return (id: string | null | undefined) => (id ? (room.players.find((p) => p.id === id)?.name ?? '(나간 사람)') : '');
}

/** 남은 초를 1초마다 다시 계산한다 */
export function useCountdown(endsAt: number): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  return Math.max(0, Math.ceil((endsAt - now) / 1000));
}

export function Scoreboard({ scores, room, highlight }: { scores: Record<string, number>; room: RoomState; highlight?: string[] }) {
  const name = useNames(room);
  const rows = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  return (
    <ol className="scoreboard">
      {rows.map(([id, s]) => (
        <li key={id} className={highlight?.includes(id) ? 'hl' : ''}>
          <span>{name(id)}</span>
          <b>{s}점</b>
        </li>
      ))}
    </ol>
  );
}
