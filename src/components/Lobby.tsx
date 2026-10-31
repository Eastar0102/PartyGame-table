import { useState } from 'react';
import type { RoomState } from '../../shared/types.ts';
import { GAME_UI } from '../games/index.tsx';
import { request, socket } from '../socket.ts';

export function Lobby({ room }: { room: RoomState }) {
  const isHost = room.me === room.hostId;
  const selected = room.games.find((g) => g.id === room.selectedGameId) ?? room.games[0];
  const optionDefs = GAME_UI[selected.id]?.options ?? [];
  const [options, setOptions] = useState<Record<string, Record<string, string>>>({});
  const [error, setError] = useState('');
  const present = room.players.filter((p) => p.connected).length;

  const current = (key: string, def: string) => options[selected.id]?.[key] ?? def;

  const start = async () => {
    setError('');
    const opts: Record<string, string> = {};
    for (const o of optionDefs) opts[o.key] = current(o.key, o.default);
    const res = await request((ack) => socket.emit('game:start', opts, ack));
    if (!res.ok) setError(res.error);
  };

  return (
    <div className="lobby">
      <h2>게임 고르기</h2>
      <p className="muted">{isHost ? '게임을 고르고 시작 버튼을 누르세요.' : '방장이 게임을 고르는 중입니다.'}</p>
      <div className="game-grid">
        {room.games.map((g) => (
          <button
            key={g.id}
            className={`game-card ${g.id === selected.id ? 'selected' : ''}`}
            disabled={!isHost && g.id !== selected.id}
            onClick={() => isHost && socket.emit('game:select', g.id)}
          >
            <span className="game-emoji">{g.emoji}</span>
            <b>{g.name}</b>
            <span className="muted small-text">
              {g.minPlayers === g.maxPlayers ? `${g.minPlayers}명` : `${g.minPlayers}~${g.maxPlayers}명`}
            </span>
          </button>
        ))}
      </div>
      <div className="card selected-game">
        <h3>
          {selected.emoji} {selected.name}
        </h3>
        <p>{selected.description}</p>
        {optionDefs.length > 0 && (
          <div className="options">
            {optionDefs.map((o) => (
              <label key={o.key}>
                {o.label}
                <select
                  disabled={!isHost}
                  value={current(o.key, o.default)}
                  onChange={(e) => setOptions({ ...options, [selected.id]: { ...options[selected.id], [o.key]: e.target.value } })}
                >
                  {o.choices.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        )}
        <p className="muted">
          지금 접속 중 {present}명
          {present < selected.minPlayers && ` · 최소 ${selected.minPlayers}명 필요`}
          {present > selected.maxPlayers && ` · ${selected.maxPlayers}명까지 참가, 나머지는 관전`}
        </p>
        {isHost && (
          <button className="primary big" disabled={present < selected.minPlayers} onClick={start}>
            시작하기
          </button>
        )}
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}
