import { useState } from 'react';
import { act } from '../socket.ts';
import { useNames, type GameProps } from './common.tsx';

type Role = 'mafia' | 'doctor' | 'police' | 'citizen';
const ROLE: Record<Role, { name: string; emoji: string; night: string }> = {
  mafia: { name: '마피아', emoji: '🔪', night: '오늘 밤 제거할 사람을 고르세요. (마피아끼리 의견이 갈리면 표가 많은 쪽)' },
  doctor: { name: '의사', emoji: '💉', night: '오늘 밤 살릴 사람을 고르세요. 자신도 고를 수 있습니다.' },
  police: { name: '경찰', emoji: '🚓', night: '오늘 밤 조사할 사람을 고르세요. 아침에 마피아인지 알려드립니다.' },
  citizen: { name: '시민', emoji: '🙂', night: '밤에는 할 일이 없습니다. 아침을 기다리세요.' },
};

interface View {
  phase: 'night' | 'day' | 'over';
  day: number;
  myRole: Role | null;
  alive: string[];
  players: string[];
  visibleRoles: Record<string, Role>;
  myNightTarget: string | null;
  mafiaVotes: Record<string, string> | null;
  mafiaChat: { id: string; text: string }[] | null;
  policeResults: { day: number; target: string; isMafia: boolean }[] | null;
  dayVotes: Record<string, string>;
  events: string[];
  winner: 'mafia' | 'citizens' | null;
}

export function Mafia({ view, room }: GameProps<View>) {
  const name = useNames(room);
  const [chat, setChat] = useState('');
  const amAlive = view.alive.includes(room.me);
  const role = view.myRole;
  const isHost = room.me === room.hostId;
  const myDayVote = view.dayVotes[room.me];

  const voteCount = (id: string) => Object.values(view.dayVotes).filter((v) => v === id).length;

  return (
    <div className={`mafia ${view.phase}`}>
      <div className="card role-card">
        {role ? (
          <>
            <div className="big-text">
              {ROLE[role].emoji} 나는 <b>{ROLE[role].name}</b>
            </div>
            {!amAlive && view.phase !== 'over' && <div className="muted">💀 죽었습니다. 조용히 지켜봐 주세요.</div>}
          </>
        ) : (
          <div className="muted">관전 중입니다</div>
        )}
        <div className="phase-label">{view.phase === 'night' ? `🌙 ${view.day}번째 밤` : view.phase === 'day' ? `☀️ ${view.day}일째 낮` : '🏁 게임 종료'}</div>
      </div>

      {view.phase === 'over' && (
        <div className="card result">
          <h2>{view.winner === 'mafia' ? '🔪 마피아 승리!' : '🙌 시민 승리!'}</h2>
        </div>
      )}

      {view.phase === 'night' && amAlive && role && (
        <div className="card">
          <h3>{ROLE[role].night}</h3>
          {role !== 'citizen' && (
            <div className="vote-grid">
              {view.alive.map((id) => {
                const mafiaPicks = view.mafiaVotes ? Object.entries(view.mafiaVotes).filter(([, t]) => t === id).map(([m]) => name(m)) : [];
                const disabled = (role === 'mafia' && view.visibleRoles[id] === 'mafia') || (role === 'police' && (id === room.me || !!view.myNightTarget));
                return (
                  <button key={id} className={`vote-btn ${view.myNightTarget === id ? 'selected' : ''}`} disabled={disabled} onClick={() => act({ type: 'night', target: id })}>
                    {name(id)}
                    {view.visibleRoles[id] === 'mafia' && role === 'mafia' && <span className="tag">마피아</span>}
                    {mafiaPicks.length > 0 && <span className="tag">← {mafiaPicks.join(', ')}</span>}
                  </button>
                );
              })}
            </div>
          )}
          {role === 'police' && view.myNightTarget && <p className="muted">조사 대상을 정했습니다. 결과는 아침에 알려드립니다.</p>}
        </div>
      )}

      {view.mafiaChat && (
        <div className="card mafia-chat">
          <h3>🔪 마피아 비밀 대화</h3>
          {view.mafiaChat.map((m, i) => (
            <div key={i}>
              <b>{name(m.id)}</b> {m.text}
            </div>
          ))}
          {amAlive && (
            <form
              className="row"
              onSubmit={async (e) => {
                e.preventDefault();
                if (chat.trim() && (await act({ type: 'mafiaChat', text: chat }))) setChat('');
              }}
            >
              <input value={chat} placeholder="마피아끼리만 보입니다" onChange={(e) => setChat(e.target.value)} />
              <button>전송</button>
            </form>
          )}
        </div>
      )}

      {view.policeResults && view.policeResults.length > 0 && (
        <div className="card">
          <h3>🚓 조사 결과</h3>
          <ul>
            {view.policeResults.map((r, i) => (
              <li key={i}>
                {r.day}번째 밤: {name(r.target)} → {r.isMafia ? <b className="danger-text">마피아!</b> : '마피아 아님'}
              </li>
            ))}
          </ul>
        </div>
      )}

      {view.phase === 'day' && (
        <div className="card">
          <h3>⚖️ 토론 후 처형할 사람에게 투표하세요 (채팅으로 토론)</h3>
          <div className="vote-grid">
            {view.alive.map((id) => (
              <button key={id} className={`vote-btn ${myDayVote === id ? 'selected' : ''}`} disabled={!amAlive} onClick={() => act({ type: 'vote', target: id })}>
                {name(id)} {voteCount(id) > 0 && <span className="tag">{voteCount(id)}표</span>}
              </button>
            ))}
            <button className={`vote-btn ${myDayVote === 'skip' ? 'selected' : ''}`} disabled={!amAlive} onClick={() => act({ type: 'vote', target: 'skip' })}>
              기권 {voteCount('skip') > 0 && <span className="tag">{voteCount('skip')}표</span>}
            </button>
          </div>
          <p className="muted">
            {Object.keys(view.dayVotes).length}/{view.alive.length}명 투표. 모두 투표하면 결과가 나옵니다. 최다 득표가 동점이거나 기권보다 적으면 아무도 처형되지 않습니다.
          </p>
        </div>
      )}

      {isHost && view.phase !== 'over' && (
        <button className="small" onClick={() => confirm(view.phase === 'night' ? '아직 행동하지 않은 사람이 있어도 아침으로 넘길까요?' : '지금까지의 표로 투표를 마감할까요?') && act({ type: 'advance' })}>
          {view.phase === 'night' ? '아침으로 넘기기' : '투표 마감'} (방장)
        </button>
      )}

      <div className="card">
        <h3>👥 생존자 {view.alive.length}명</h3>
        <div className="row wrap">
          {view.players.map((id) => (
            <span key={id} className={`chip ${view.alive.includes(id) ? '' : 'dead'}`}>
              {view.alive.includes(id) ? '' : '💀 '}
              {name(id)}
              {view.visibleRoles[id] && id !== room.me && ` (${ROLE[view.visibleRoles[id]].name})`}
            </span>
          ))}
        </div>
      </div>

      <div className="card">
        <h3>📜 기록</h3>
        <ul className="events">
          {[...view.events].reverse().map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
