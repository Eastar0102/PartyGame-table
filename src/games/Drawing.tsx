import { useEffect, useRef, useState } from 'react';
import { act, actFast, socket } from '../socket.ts';
import { useCountdownTicks, useSoundOn, useTurnSound } from '../sound.ts';
import { Scoreboard, useCountdown, useNames, type GameProps } from './common.tsx';

interface Stroke {
  color: string;
  width: number;
  points: number[];
}

interface View {
  phase: 'drawing' | 'reveal' | 'over';
  drawer: string;
  word: string | null;
  hint: string;
  strokes: Stroke[];
  guessed: string[];
  feed: { id: string; text: string; correct?: boolean }[];
  scores: Record<string, number>;
  endsAt: number;
  turnNo: number;
  totalTurns: number;
  players: string[];
}

const W = 800;
const H = 600;
const COLORS = ['#222222', '#e03131', '#f08c00', '#fcc419', '#2f9e44', '#1971c2', '#7048e8', '#e64980', '#8d5524', '#ffffff'];
const WIDTHS = [3, 6, 12, 24];

function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke) {
  ctx.strokeStyle = s.color;
  ctx.lineWidth = s.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(s.points[0] * W, s.points[1] * H);
  if (s.points.length === 2) ctx.lineTo(s.points[0] * W + 0.1, s.points[1] * H);
  for (let i = 2; i < s.points.length; i += 2) ctx.lineTo(s.points[i] * W, s.points[i + 1] * H);
  ctx.stroke();
}

function redraw(canvas: HTMLCanvasElement | null, strokes: Stroke[]) {
  const ctx = canvas?.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  for (const s of strokes) drawStroke(ctx, s);
}

export function Drawing({ view, room }: GameProps<View>) {
  const name = useNames(room);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const [color, setColor] = useState(COLORS[0]);
  const [width, setWidth] = useState(WIDTHS[1]);
  const [guess, setGuess] = useState('');
  const remaining = useCountdown(view.endsAt);
  const isDrawer = view.drawer === room.me && view.phase === 'drawing';
  const playing = view.players.includes(room.me);
  const guessed = view.guessed.includes(room.me);
  useTurnSound(isDrawer);
  useCountdownTicks(remaining, view.phase === 'drawing');
  useSoundOn(view.guessed.length, (n, p) => (n > p ? 'success' : null));
  useSoundOn(view.phase, (ph) => (ph === 'reveal' ? 'click' : ph === 'over' ? 'win' : null));

  // 그리는 중인 획 정보
  const drawingRef = useRef<{ points: number[]; sent: number; chunks: number } | null>(null);
  const chunkHistory = useRef<number[]>([]);

  // 서버의 전체 상태가 오면 캔버스를 다시 그린다
  useEffect(() => {
    strokesRef.current = [...view.strokes];
    redraw(canvasRef.current, strokesRef.current);
  }, [view.strokes]);

  useEffect(() => {
    chunkHistory.current = [];
  }, [view.turnNo]);

  // 다른 사람의 획은 가벼운 이벤트로 실시간 반영
  useEffect(() => {
    const onEvent = (e: { type: string; [k: string]: unknown }) => {
      const ctx = canvasRef.current?.getContext('2d');
      if (e.type === 'draw:stroke') {
        const s = e.stroke as Stroke;
        strokesRef.current.push(s);
        if (ctx) drawStroke(ctx, s);
      } else if (e.type === 'draw:clear') {
        strokesRef.current = [];
        redraw(canvasRef.current, []);
      } else if (e.type === 'draw:replace') {
        strokesRef.current = [...(e.strokes as Stroke[])];
        redraw(canvasRef.current, strokesRef.current);
      }
    };
    socket.on('game:event', onEvent);
    return () => {
      socket.off('game:event', onEvent);
    };
  }, []);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))];
  };

  /** 아직 안 보낸 점들을 한 조각으로 보낸다. 이어지도록 직전 점을 함께 넣는다 */
  const flush = () => {
    const d = drawingRef.current;
    if (!d) return;
    if (d.points.length <= d.sent) return;
    const start = Math.max(0, d.sent - 2);
    const points = d.points.slice(start, start + 400);
    d.sent = start + points.length;
    d.chunks++;
    actFast({ type: 'stroke', color, width, points });
  };

  useEffect(() => {
    if (!isDrawer) return;
    const t = setInterval(flush, 60);
    return () => clearInterval(t);
  });

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawer) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = { points: pos(e), sent: 0, chunks: 0 };
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drawingRef.current;
    if (!d) return;
    const [x, y] = pos(e);
    const ctx = canvasRef.current?.getContext('2d');
    const lx = d.points[d.points.length - 2];
    const ly = d.points[d.points.length - 1];
    if (Math.abs(x - lx) + Math.abs(y - ly) < 0.002) return;
    if (ctx) drawStroke(ctx, { color, width, points: [lx, ly, x, y] });
    d.points.push(x, y);
    if (d.points.length - d.sent >= 380) flush();
  };
  const onUp = () => {
    const d = drawingRef.current;
    if (!d) return;
    if (d.sent === 0) {
      // 점 하나만 찍은 경우
      d.chunks++;
      actFast({ type: 'stroke', color, width, points: d.points.slice(0, 2) });
    } else flush();
    chunkHistory.current.push(d.chunks);
    drawingRef.current = null;
  };

  const undo = () => {
    const n = chunkHistory.current.pop();
    if (n) act({ type: 'undo', count: n });
  };

  let banner: string;
  if (view.phase === 'over') banner = '🏁 게임 끝!';
  else if (view.phase === 'reveal') banner = `정답: ${view.word}`;
  else if (isDrawer) banner = `제시어: ${view.word}`;
  else if (guessed) banner = `🎉 정답! (${view.word})`;
  else banner = `${view.hint} (${[...view.hint].filter((c) => c !== ' ').length}글자)`;

  return (
    <div className="drawing">
      <div className="drawing-head">
        <span className="muted">
          {view.turnNo}/{view.totalTurns} · ✏️ {name(view.drawer)}
        </span>
        <b className={`big-text ${isDrawer ? 'my-turn' : ''}`}>{banner}</b>
        {view.phase === 'drawing' && <span className={`timer ${remaining <= 10 ? 'danger-text' : ''}`}>⏱ {remaining}</span>}
      </div>
      <div className="drawing-body">
        <div className="canvas-wrap">
          <canvas
            ref={canvasRef}
            width={W}
            height={H}
            className={isDrawer ? 'can-draw' : ''}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
          />
          {isDrawer && (
            <div className="toolbar">
              {COLORS.map((c) => (
                <button key={c} className={`swatch ${c === color ? 'selected' : ''}`} style={{ background: c }} onClick={() => setColor(c)} aria-label={c} />
              ))}
              {WIDTHS.map((w) => (
                <button key={w} className={`small ${w === width ? 'selected' : ''}`} onClick={() => setWidth(w)}>
                  <span className="dot" style={{ width: w / 1.5 + 2, height: w / 1.5 + 2 }} />
                </button>
              ))}
              <button className="small" onClick={undo}>
                ↶ 되돌리기
              </button>
              <button
                className="small"
                onClick={() => {
                  chunkHistory.current = [];
                  act({ type: 'clear' });
                }}
              >
                🗑 전체 지우기
              </button>
              <button className="small" onClick={() => act({ type: 'skip' })}>
                ⏭ 넘기기
              </button>
            </div>
          )}
          {!isDrawer && room.me === room.hostId && view.phase === 'drawing' && (
            <button className="small" onClick={() => act({ type: 'skip' })}>
              ⏭ 이번 그림 넘기기 (방장)
            </button>
          )}
        </div>
        <div className="guess-panel card">
          <h3>정답 외치기</h3>
          <div className="guess-feed">
            {view.feed.map((f, i) => (
              <div key={i} className={f.correct ? 'correct' : ''}>
                <b>{name(f.id)}</b> {f.correct ? '🎉 정답을 맞혔습니다!' : f.text}
              </div>
            ))}
          </div>
          {view.phase === 'drawing' && playing && !isDrawer && !guessed && (
            <form
              className="row"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!guess.trim()) return;
                setGuess('');
                await act({ type: 'guess', text: guess });
              }}
            >
              <input value={guess} placeholder="정답은?" onChange={(e) => setGuess(e.target.value)} autoFocus />
              <button className="primary">제출</button>
            </form>
          )}
          <Scoreboard scores={view.scores} room={room} highlight={view.guessed} />
        </div>
      </div>
    </div>
  );
}
