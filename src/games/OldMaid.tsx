import { cardLabel, type CardId } from '../../shared/cards.ts';
import { Avatar } from '../art/Avatar.tsx';
import { PlayingCard } from '../art/PlayingCard.tsx';
import { act } from '../socket.ts';
import { useSoundOn, useTurnSound } from '../sound.ts';
import { useNames, type GameProps } from './common.tsx';

interface View {
  phase: 'playing' | 'over';
  seats: string[];
  order: string[];
  counts: Record<string, number>;
  myHand: CardId[] | null;
  current: string | null;
  target: string | null;
  pairs: { id: string; cards: [CardId, CardId] }[];
  pairCount: number;
  safe: string[];
  loser: string | null;
  lastDraw: null | { from: string; to: string; paired: boolean; card: CardId | null };
  seq: number;
}

export function OldMaid({ view, room }: GameProps<View>) {
  const name = useNames(room);
  const myTurn = view.current === room.me;
  const ld = view.lastDraw;

  useTurnSound(myTurn);
  useSoundOn(view.seq, () => (view.lastDraw?.paired ? 'success' : 'card'));
  useSoundOn(view.loser, (l) => (l ? (l === room.me ? 'fail' : 'win') : null));

  let drawText = '';
  if (ld) {
    drawText = `${name(ld.to)}님이 ${name(ld.from)}님에게서 한 장 뽑았습니다`;
    if (ld.paired) drawText += ` → ${ld.card ? cardLabel(ld.card) : ''} 짝 완성!`;
    else if (ld.card && ld.to === room.me) drawText += ` → 내가 받은 카드: ${cardLabel(ld.card)}`;
    else if (ld.card && ld.from === room.me) drawText += ` → 빼앗긴 카드: ${cardLabel(ld.card)}`;
  }

  return (
    <div className="cardgame">
      <div className="opponents">
        {view.seats
          .filter((id) => id !== room.me)
          .map((id) => {
            const safeRank = view.safe.indexOf(id);
            return (
              <div key={id} className={`seat ${view.current === id ? 'active' : ''} ${view.target === id ? 'targeted' : ''} ${safeRank >= 0 ? 'out' : ''}`}>
                <Avatar id={id} size={30} />
                <div>
                  <b>{name(id)}</b>
                  <div className="muted small-text">
                    {safeRank >= 0 ? `🎉 탈출 ${safeRank + 1}등` : view.loser === id ? '🃏 도둑!' : `${view.counts[id]}장`}
                  </div>
                </div>
              </div>
            );
          })}
      </div>

      {view.phase === 'over' ? (
        <div className="card result">
          <h2>🃏 도둑은 {name(view.loser)}님!</h2>
          <p>탈출 순서: {view.safe.map((id) => name(id)).join(' → ')}</p>
        </div>
      ) : (
        <div className="felt column">
          <p className={`status ${myTurn ? 'my-turn' : ''}`}>
            {myTurn ? `내 차례! ${name(view.target)}님의 카드 중 한 장을 뽑으세요` : `${name(view.current)}님이 ${name(view.target)}님의 카드를 고르는 중…`}
          </p>
          {view.target && (
            <div className="hand spread">
              {Array.from({ length: view.counts[view.target] ?? 0 }, (_, i) => (
                <PlayingCard key={`${view.seq}-${i}`} width={66} back="red" onClick={myTurn ? () => act({ type: 'draw', index: i }) : undefined} disabled={!myTurn} title={`${i + 1}번째 카드`} />
              ))}
            </div>
          )}
          <div className="muted small-text" style={{ color: '#dfe' }}>
            {view.target ? `${name(view.target)}님의 패 (${view.counts[view.target]}장)` : ''}
          </div>
        </div>
      )}

      {drawText && <p className="center-text">{drawText}</p>}

      {view.myHand && view.myHand.length > 0 && (
        <>
          <div className="hand">
            {view.myHand.map((c) => (
              <PlayingCard key={c} card={c} width={72} />
            ))}
          </div>
          <div className="row center">
            <span className="muted">내 패 {view.myHand.length}장 · 다른 사람은 이 순서대로 뒷면을 봅니다</span>
            <button className="small" onClick={() => act({ type: 'shuffle' })}>
              🔀 섞기
            </button>
          </div>
        </>
      )}
      {view.myHand && view.myHand.length === 0 && <p className="center-text">🎉 탈출했습니다! 구경하세요.</p>}

      <div className="card">
        <h3>버린 짝 ({view.pairCount}쌍)</h3>
        <div className="pairs">
          {view.pairs.map((p, i) => (
            <span key={i} className="pair" title={name(p.id)}>
              <PlayingCard card={p.cards[0]} width={30} />
              <PlayingCard card={p.cards[1]} width={30} style={{ marginLeft: -16 }} />
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
