import { useEffect, useRef, useState } from 'react';
import type { RoomState } from '../../shared/types.ts';
import { socket } from '../socket.ts';

export function Chat({ room }: { room: RoomState }) {
  const [text, setText] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const last = room.chat[room.chat.length - 1]?.id;

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [last]);

  return (
    <div className="card chat">
      <h3>채팅</h3>
      <div className="chat-list" ref={listRef}>
        {room.chat.map((m) =>
          m.kind === 'system' ? (
            <div key={m.id} className="chat-system">
              {m.text}
            </div>
          ) : (
            <div key={m.id} className={`chat-msg ${m.from?.id === room.me ? 'mine' : ''}`}>
              <b>{m.from?.name}</b> {m.text}
            </div>
          ),
        )}
      </div>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          socket.emit('chat:send', text);
          setText('');
        }}
      >
        <input value={text} maxLength={500} placeholder="메시지 입력" onChange={(e) => setText(e.target.value)} />
        <button>전송</button>
      </form>
    </div>
  );
}
