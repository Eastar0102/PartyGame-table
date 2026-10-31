import { nameOf, shuffle, type GameModule } from './types.ts';

export const SIZE = 15;

interface GomokuState {
  board: (0 | 1 | 2)[]; // 0 빈칸, 1 흑, 2 백
  black: string;
  white: string;
  turn: 1 | 2;
  lastMove: number | null;
  winner: string | null;
  winLine: number[];
  moves: number;
  draw: boolean;
}

/** 방금 둔 돌로 5목 이상이 완성됐는지 확인하고, 완성된 줄의 칸 번호를 돌려준다 */
export function findWinLine(board: (0 | 1 | 2)[], idx: number): number[] | null {
  const color = board[idx];
  if (!color) return null;
  const r0 = Math.floor(idx / SIZE);
  const c0 = idx % SIZE;
  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    const line = [idx];
    for (const s of [1, -1]) {
      let r = r0 + dr * s;
      let c = c0 + dc * s;
      while (r >= 0 && r < SIZE && c >= 0 && c < SIZE && board[r * SIZE + c] === color) {
        line.push(r * SIZE + c);
        r += dr * s;
        c += dc * s;
      }
    }
    if (line.length >= 5) return line.sort((a, b) => a - b);
  }
  return null;
}

export const gomoku: GameModule<GomokuState> = {
  meta: {
    id: 'gomoku',
    name: '오목',
    emoji: '⚫',
    description: '15×15 판에서 다섯 개를 먼저 잇는 사람이 승리. 흑이 먼저 둡니다. 세 번째 사람부터는 관전합니다.',
    minPlayers: 2,
    maxPlayers: 2,
  },

  setup(ctx) {
    const [black, white] = shuffle(ctx.players, ctx.random);
    return {
      board: Array(SIZE * SIZE).fill(0),
      black: black.id,
      white: white.id,
      turn: 1,
      lastMove: null,
      winner: null,
      winLine: [],
      moves: 0,
      draw: false,
    };
  },

  action(state, pid, action, ctx) {
    if (action.type === 'rematch') {
      if (pid !== ctx.hostId && pid !== state.black && pid !== state.white) return '참가자나 방장만 다시 시작할 수 있습니다.';
      if (!state.winner && !state.draw) return '아직 게임이 끝나지 않았습니다.';
      // 흑백을 바꿔서 새 판
      Object.assign(state, {
        board: Array(SIZE * SIZE).fill(0),
        black: state.white,
        white: state.black,
        turn: 1,
        lastMove: null,
        winner: null,
        winLine: [],
        moves: 0,
        draw: false,
      });
      ctx.announce(`오목 새 판! 흑: ${nameOf(ctx, state.black)}, 백: ${nameOf(ctx, state.white)}`);
      return;
    }
    if (action.type === 'resign') {
      if (state.winner || state.draw) return;
      if (pid !== state.black && pid !== state.white) return '참가자가 아닙니다.';
      state.winner = pid === state.black ? state.white : state.black;
      ctx.announce(`${nameOf(ctx, pid)}님이 기권했습니다. ${nameOf(ctx, state.winner)}님 승리!`);
      return;
    }
    if (action.type !== 'place') return '알 수 없는 행동입니다.';
    if (state.winner || state.draw) return '게임이 끝났습니다.';
    const current = state.turn === 1 ? state.black : state.white;
    if (pid !== current) return pid === state.black || pid === state.white ? '상대 차례입니다.' : '관전 중입니다.';
    const idx = Number(action.index);
    if (!Number.isInteger(idx) || idx < 0 || idx >= SIZE * SIZE) return '잘못된 위치입니다.';
    if (state.board[idx] !== 0) return '이미 돌이 있습니다.';
    state.board[idx] = state.turn;
    state.lastMove = idx;
    state.moves++;
    const line = findWinLine(state.board, idx);
    if (line) {
      state.winner = pid;
      state.winLine = line;
      ctx.announce(`🏆 ${nameOf(ctx, pid)}님이 오목에서 승리했습니다!`);
    } else if (state.moves === SIZE * SIZE) {
      state.draw = true;
      ctx.announce('판이 가득 차서 무승부입니다.');
    } else {
      state.turn = state.turn === 1 ? 2 : 1;
    }
  },

  view(state) {
    return state;
  },

  onLeave(state, pid, ctx) {
    if (state.winner || state.draw) return;
    if (pid === state.black || pid === state.white) {
      state.winner = pid === state.black ? state.white : state.black;
      ctx.announce(`상대가 나가서 ${nameOf(ctx, state.winner)}님이 승리했습니다.`);
    }
  },
};
