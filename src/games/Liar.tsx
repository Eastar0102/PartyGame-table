import { useState } from 'react';
import { act } from '../socket.ts';
import { useSoundOn, useTurnSound } from '../sound.ts';
import { Scoreboard, useNames, type GameProps } from './common.tsx';

interface View {
  phase: 'hint' | 'vote' | 'liarGuess' | 'result';
  category: string;
  word: string | null;
  isLiar: boolean;
  liarId: string | null;
  order: string[];
  currentTurn: string | null;
  hintRound: number;
  hintRounds: number;
  hints: { id: string; text: string }[];
  votedIds: string[];
  myVote: string | null;
  votes: Record<string, string> | null;
  voteCounts: Record<string, number>;
  accused: string | null;
  liarGuess: string | null;
  result: null | { winner: 'liar' | 'citizens'; reason: string };
  scores: Record<string, number>;
}

export function Liar({ view, room }: GameProps<View>) {
  const name = useNames(room);
  const [text, setText] = useState('');
  const isHost = room.me === room.hostId;
  const inGame = view.order.includes(room.me);
  const myTurn = view.currentTurn === room.me;
  useTurnSound(myTurn);
  useSoundOn(view.hints.length, (n, p) => (n > p ? 'card' : null));
  useSoundOn(view.phase, (ph) => {
    if (ph === 'vote' || ph === 'liarGuess') return 'turn';
    if (ph !== 'result' || !view.result) return null;
    const liarWon = view.result.winner === 'liar';
    if (!inGame) return 'success';
    return liarWon === (room.me === view.liarId) ? 'win' : 'fail';
  });

  return (
    <div className="liar">
      <div className={`card secret-card ${view.isLiar && view.phase !== 'result' ? 'liar-card' : ''}`}>
        <div className="muted">주제</div>
        <div className="big-text">{view.category}</div>
        {view.phase === 'result' ? (
          <div>
            제시어: <b>{view.word}</b>
          </div>
        ) : !inGame ? (
          <div className="muted">관전 중 (제시어는 끝나면 공개됩니다)</div>
        ) : view.isLiar ? (
          <div className="liar-word">🤥 당신은 라이어입니다! 들키지 않게 설명하세요.</div>
        ) : (
          <div>
            제시어: <b className="big-text">{view.word}</b>
          </div>
        )}
      </div>

      <div className="card">
        <h3>
          💬 설명 {view.phase === 'hint' && view.hintRounds > 1 && <span className="muted">({view.hintRound}/{view.hintRounds}바퀴)</span>}
        </h3>
        <ol className="hint-list">
          {view.hints.map((h, i) => (
            <li key={i}>
              <b>{name(h.id)}</b> {h.text}
            </li>
          ))}
        </ol>
        {view.phase === 'hint' && (
          <>
            <p className={`status ${myTurn ? 'my-turn' : ''}`}>{myTurn ? '내 차례! 제시어를 한 줄로 설명하세요.' : `${name(view.currentTurn)}님이 설명하는 중…`}</p>
            {myTurn && (
              <form
                className="row"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (await act({ type: 'hint', text })) setText('');
                }}
              >
                <input value={text} maxLength={60} placeholder="너무 쉽지도, 어렵지도 않게!" onChange={(e) => setText(e.target.value)} autoFocus />
                <button className="primary">제출</button>
              </form>
            )}
            {isHost && !myTurn && (
              <button className="small" onClick={() => act({ type: 'skipHint' })}>
                이 사람 차례 넘기기
              </button>
            )}
          </>
        )}
      </div>

      {view.phase === 'vote' && (
        <div className="card">
          <h3>🗳️ 라이어는 누구?</h3>
          <div className="vote-grid">
            {view.order.map((id) => (
              <button
                key={id}
                className={`vote-btn ${view.myVote === id ? 'selected' : ''}`}
                disabled={!inGame || id === room.me}
                onClick={() => act({ type: 'vote', target: id })}
              >
                {name(id)} {view.votedIds.includes(id) && <span className="tag">투표함</span>}
              </button>
            ))}
          </div>
          <p className="muted">
            {view.votedIds.length}/{view.order.length}명 투표 완료. 모두 투표하면 결과가 나옵니다.
          </p>
          {isHost && (
            <button className="small" onClick={() => act({ type: 'closeVote' })}>
              지금 투표 마감
            </button>
          )}
        </div>
      )}

      {view.phase === 'liarGuess' && (
        <div className="card">
          <h3>🎯 라이어 {name(view.liarId)}님의 마지막 기회</h3>
          {room.me === view.liarId ? (
            <form
              className="row"
              onSubmit={(e) => {
                e.preventDefault();
                act({ type: 'guess', word: text });
                setText('');
              }}
            >
              <input value={text} placeholder="제시어가 무엇이었을까요?" onChange={(e) => setText(e.target.value)} autoFocus />
              <button className="primary">정답 제출</button>
            </form>
          ) : (
            <p className="muted">라이어가 제시어를 추리하는 중입니다…</p>
          )}
        </div>
      )}

      {view.phase === 'result' && view.result && (
        <div className="card result">
          <h2>{view.result.winner === 'liar' ? '🤥 라이어 승리!' : '🙌 시민 승리!'}</h2>
          <p>{view.result.reason}</p>
          <p>
            라이어: <b>{name(view.liarId)}</b> · 제시어: <b>{view.word}</b>
            {view.liarGuess && <> · 라이어의 답: {view.liarGuess}</>}
          </p>
          {view.votes && (
            <p className="muted small-text">
              투표:{' '}
              {Object.entries(view.voteCounts)
                .map(([id, n]) => `${name(id)} ${n}표`)
                .join(', ') || '없음'}
            </p>
          )}
          {isHost && (
            <button className="primary" onClick={() => act({ type: 'next' })}>
              다음 판
            </button>
          )}
        </div>
      )}

      <div className="card">
        <h3>점수</h3>
        <Scoreboard scores={view.scores} room={room} />
        <p className="muted small-text">라이어 승리 시 라이어 +2점, 시민 승리 시 시민 모두 +1점</p>
      </div>
    </div>
  );
}
