import { useState } from 'react';
import type { RoomState } from '../../shared/types.ts';
import { GAME_UI } from '../games/index.tsx';
import { socket } from '../socket.ts';
import { Chat } from './Chat.tsx';
import { Lobby } from './Lobby.tsx';

export function Room({ room, onLeave }: { room: RoomState; onLeave: () => void }) {
  const [copied, setCopied] = useState(false);
  const isHost = room.me === room.hostId;
  const game = room.game;
  const ui = game ? GAME_UI[game.id] : null;
  const meta = game ? room.games.find((g) => g.id === game.id) : null;

  const copyLink = async () => {
    const link = `${location.origin}${location.pathname}#/${room.code}`;
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      prompt('초대 링크를 복사하세요', link);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="room">
      <header className="room-header">
        <div className="room-title">
          <span className="logo">🎲</span>
          <span>
            방 코드 <b className="code">{room.code}</b>
          </span>
          <button className="small" onClick={copyLink}>
            {copied ? '복사됨!' : '초대 링크 복사'}
          </button>
        </div>
        <div className="row">
          {game && meta && (
            <span className="muted">
              {meta.emoji} {meta.name} 진행 중
            </span>
          )}
          {game && isHost && (
            <button className="small danger" onClick={() => confirm('게임을 끝내고 로비로 돌아갈까요?') && socket.emit('game:end')}>
              게임 종료
            </button>
          )}
          <button className="small" onClick={() => confirm('방에서 나갈까요?') && onLeave()}>
            나가기
          </button>
        </div>
      </header>
      <main className="room-main">
        <section className="stage">
          {game && ui ? (
            <ui.Component view={game.view} room={room} />
          ) : (
            <Lobby room={room} />
          )}
        </section>
        <aside className="sidebar">
          <PlayerList room={room} />
          <Chat room={room} />
        </aside>
      </main>
    </div>
  );
}

function PlayerList({ room }: { room: RoomState }) {
  const isHost = room.me === room.hostId;
  const [menu, setMenu] = useState<string | null>(null);
  return (
    <div className="card players">
      <h3>참가자 {room.players.length}명</h3>
      <ul>
        {room.players.map((p) => {
          const spectating = room.game && room.game.id !== 'trpg' && !room.game.playerIds.includes(p.id);
          return (
            <li key={p.id} className={p.connected ? '' : 'offline'}>
              <span className="pname">
                {p.isHost && '👑 '}
                {p.name}
                {p.id === room.me && <span className="tag">나</span>}
                {spectating && <span className="tag">관전</span>}
                {!p.connected && <span className="tag">연결 끊김</span>}
              </span>
              {isHost && p.id !== room.me && (
                <span className="pmenu">
                  <button className="tiny" onClick={() => setMenu(menu === p.id ? null : p.id)}>
                    ⋯
                  </button>
                  {menu === p.id && (
                    <span className="pmenu-pop">
                      <button className="tiny" onClick={() => (socket.emit('room:transferHost', p.id), setMenu(null))}>
                        방장 넘기기
                      </button>
                      <button
                        className="tiny danger"
                        onClick={() => {
                          if (confirm(`${p.name}님을 내보낼까요?`)) socket.emit('room:kick', p.id);
                          setMenu(null);
                        }}
                      >
                        내보내기
                      </button>
                    </span>
                  )}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
