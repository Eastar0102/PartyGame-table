import { act } from '../socket.ts';
import { useSoundOn, useTurnSound } from '../sound.ts';
import { useNames, type GameProps } from './common.tsx';

const SIZE = 15;
const STARS = new Set([3 * SIZE + 3, 3 * SIZE + 11, 7 * SIZE + 7, 11 * SIZE + 3, 11 * SIZE + 11]);

interface View {
  board: (0 | 1 | 2)[];
  black: string;
  white: string;
  turn: 1 | 2;
  lastMove: number | null;
  winner: string | null;
  winLine: number[];
  draw: boolean;
  moves: number;
}

export function Gomoku({ view, room }: GameProps<View>) {
  const name = useNames(room);
  const myColor = room.me === view.black ? 1 : room.me === view.white ? 2 : 0;
  const over = !!view.winner || view.draw;
  const myTurn = !over && myColor === view.turn;
  const win = new Set(view.winLine);
  useTurnSound(myTurn);
  useSoundOn(view.moves, (now, prev) => (now > prev ? 'place' : null));
  useSoundOn(view.winner, (w) => (w ? (w === room.me ? 'win' : myColor ? 'fail' : 'success') : null));

  let status: string;
  if (view.winner) status = `🏆 ${name(view.winner)}님 승리!`;
  else if (view.draw) status = '무승부';
  else if (myTurn) status = '내 차례입니다!';
  else status = `${name(view.turn === 1 ? view.black : view.white)}님 차례 (${view.turn === 1 ? '흑' : '백'})`;

  return (
    <div className="gomoku">
      <div className="row center">
        <span className={`gomoku-player ${view.turn === 1 && !over ? 'active' : ''}`}>⚫ {name(view.black)}</span>
        <span className="muted">vs</span>
        <span className={`gomoku-player ${view.turn === 2 && !over ? 'active' : ''}`}>⚪ {name(view.white)}</span>
      </div>
      <p className={`status ${myTurn ? 'my-turn' : ''}`}>{status}</p>
      <div className="gomoku-board" style={{ gridTemplateColumns: `repeat(${SIZE}, 1fr)` }}>
        {view.board.map((cell, i) => (
          <button
            key={i}
            className={`gcell ${STARS.has(i) ? 'star' : ''} ${myTurn && !cell ? 'can' : ''}`}
            data-row={Math.floor(i / SIZE)}
            data-col={i % SIZE}
            onClick={() => myTurn && !cell && act({ type: 'place', index: i })}
            aria-label={`${Math.floor(i / SIZE) + 1}행 ${(i % SIZE) + 1}열`}
          >
            {cell !== 0 && <span className={`stone ${cell === 1 ? 'black' : 'white'} ${view.lastMove === i ? 'last' : ''} ${win.has(i) ? 'win' : ''}`} />}
          </button>
        ))}
      </div>
      <div className="row center">
        {myColor !== 0 && !over && (
          <button className="small" onClick={() => confirm('기권할까요?') && act({ type: 'resign' })}>
            기권
          </button>
        )}
        {over && (myColor !== 0 || room.me === room.hostId) && (
          <button className="primary" onClick={() => act({ type: 'rematch' })}>
            흑백 바꿔서 한 판 더
          </button>
        )}
        {myColor === 0 && <span className="muted">관전 중입니다</span>}
      </div>
    </div>
  );
}
