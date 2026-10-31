import { useEffect, useRef, useState } from 'react';
import { act } from '../socket.ts';
import { useCountdownTicks, useSoundOn, useTurnSound } from '../sound.ts';
import { useCountdown, useNames, type GameProps } from './common.tsx';

interface View {
  phase: 'playing' | 'over';
  order: string[];
  current: string | null;
  words: { id: string; word: string }[];
  nextStarts: string[] | null;
  eliminated: string[];
  endsAt: number;
  turnSeconds: number;
  winner: string | null;
}

export function WordChain({ view, room }: GameProps<View>) {
  const name = useNames(room);
  const [word, setWord] = useState('');
  const remaining = useCountdown(view.endsAt);
  const myTurn = view.current === room.me;
  const inputRef = useRef<HTMLInputElement>(null);
  useTurnSound(myTurn);
  useCountdownTicks(remaining, view.phase === 'playing' && myTurn);
  useSoundOn(view.words.length, (n, p) => (n > p ? (view.words[n - 1]?.id ? 'card' : null) : null));
  useSoundOn(view.eliminated.length, (n, p) => (n > p ? 'fail' : null));
  useSoundOn(view.winner, (w) => (w ? (w === room.me ? 'win' : 'success') : null));
  const listRef = useRef<HTMLDivElement>(null);
  const lastEntry = view.words[view.words.length - 1];
  const last = lastEntry?.id ? lastEntry : null;

  useEffect(() => {
    if (myTurn) inputRef.current?.focus();
  }, [myTurn]);
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [view.words.length]);

  return (
    <div className="wordchain">
      <div className="card">
        <div className="row center wrap">
          {view.order.map((id) => (
            <span key={id} className={`chip ${id === view.current ? 'active' : ''}`}>
              {name(id)}
            </span>
          ))}
          {view.eliminated.map((id) => (
            <span key={id} className="chip dead">
              💥 {name(id)}
            </span>
          ))}
        </div>
      </div>

      {view.phase === 'over' ? (
        <div className="card result">
          <h2>🏆 {view.winner ? `${name(view.winner)}님 우승!` : '게임 끝'}</h2>
        </div>
      ) : (
        <div className="card wc-turn">
          <div className={`timer big ${remaining <= 5 ? 'danger-text' : ''}`}>⏱ {remaining}</div>
          <p className={`status ${myTurn ? 'my-turn' : ''}`}>
            {myTurn ? '내 차례!' : `${name(view.current)}님 차례`}{' '}
            {view.nextStarts ? (
              <>
                → <b className="big-text">{view.nextStarts.join(' / ')}</b>(으)로 시작
              </>
            ) : (
              '→ 아무 단어로나 시작'
            )}
          </p>
          {myTurn && (
            <form
              className="row"
              onSubmit={async (e) => {
                e.preventDefault();
                if (await act({ type: 'word', word })) setWord('');
              }}
            >
              <input ref={inputRef} value={word} placeholder="단어 입력" onChange={(e) => setWord(e.target.value)} />
              <button className="primary">제출</button>
            </form>
          )}
        </div>
      )}

      <div className="card">
        <h3>이어진 단어</h3>
        <div className="word-list" ref={listRef}>
          {view.words.map((w, i) =>
            w.id ? (
              <span key={i} className="word-chip" title={name(w.id)}>
                {w.word}
                <small>{name(w.id)}</small>
              </span>
            ) : (
              <span key={i} className="word-break">
                ✂︎ 새로 시작
              </span>
            ),
          )}
        </div>
        {room.me === room.hostId && last && view.phase === 'playing' && (
          <button className="small" onClick={() => confirm(`"${last.word}"를 없는 단어로 판정하고 ${name(last.id)}님을 탈락시킬까요?`) && act({ type: 'reject' })}>
            마지막 단어 무효 (방장)
          </button>
        )}
      </div>
    </div>
  );
}
