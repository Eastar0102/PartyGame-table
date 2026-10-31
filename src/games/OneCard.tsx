import { useState } from 'react';
import { SUIT_NAME, SUITS, parseCard, type CardId, type Suit } from '../../shared/cards.ts';
import { Avatar } from '../art/Avatar.tsx';
import { PlayingCard, SuitShape } from '../art/PlayingCard.tsx';
import { act } from '../socket.ts';
import { useSoundOn, useTurnSound } from '../sound.ts';
import { useNames, type GameProps } from './common.tsx';

interface View {
  phase: 'playing' | 'over';
  seats: string[];
  order: string[];
  counts: Record<string, number>;
  myHand: CardId[] | null;
  playable: CardId[];
  current: string | null;
  top: CardId;
  suit: Suit | null;
  attack: number;
  dir: 1 | -1;
  deckCount: number;
  maxHand: number;
  winner: string | null;
  bankrupt: string[];
  log: string[];
  reveal: Record<string, CardId[]> | null;
}

export function OneCard({ view, room }: GameProps<View>) {
  const name = useNames(room);
  const [pickSuitFor, setPickSuitFor] = useState<CardId | null>(null);
  const myTurn = view.current === room.me;
  const playing = view.phase === 'playing';

  useTurnSound(myTurn);
  useSoundOn(view.log.length + ':' + view.top, () => (view.attack > 0 ? 'attack' : 'card'));
  useSoundOn(view.winner, (w) => (w ? (w === room.me ? 'win' : 'fail') : null));

  const play = (card: CardId) => {
    if (parseCard(card).rank === 7) setPickSuitFor(card);
    else act({ type: 'play', card });
  };

  const others = view.seats.filter((id) => id !== room.me);

  return (
    <div className="cardgame">
      <div className="opponents">
        {others.map((id) => (
          <div key={id} className={`seat ${view.current === id ? 'active' : ''} ${view.bankrupt.includes(id) ? 'out' : ''}`}>
            <Avatar id={id} size={30} />
            <div>
              <b>{name(id)}</b>
              <div className="muted small-text">{view.bankrupt.includes(id) ? '💸 파산' : `${view.counts[id]}장${view.counts[id] === 1 ? ' ☝️' : ''}`}</div>
            </div>
            <div className="mini-fan">
              {view.reveal
                ? view.reveal[id]?.map((c) => <PlayingCard key={c} card={c} width={26} />)
                : Array.from({ length: Math.min(view.counts[id] ?? 0, 10) }, (_, i) => <PlayingCard key={i} width={20} />)}
            </div>
          </div>
        ))}
      </div>

      <div className="felt">
        <div className="pile">
          <PlayingCard
            width={84}
            onClick={myTurn ? () => act({ type: 'draw' }) : undefined}
            disabled={!myTurn}
            title={view.attack > 0 ? `${view.attack}장 먹기` : '1장 가져가기'}
          />
          <span className="pile-label">남은 카드 {view.deckCount}</span>
        </div>
        <div className="pile">
          <PlayingCard card={view.top} width={84} />
          <span className="pile-label">
            {view.suit ? (
              <>
                <svg viewBox="0 0 20 20" width={14} height={14}>
                  <SuitShape suit={view.suit} />
                </svg>{' '}
                {SUIT_NAME[view.suit]}
              </>
            ) : (
              '아무 카드나'
            )}
          </span>
        </div>
        <div className="table-info">
          <div className="dir">{view.dir === 1 ? '↻ 시계 방향' : '↺ 반시계 방향'}</div>
          {view.attack > 0 && <div className="attack-badge">💥 공격 {view.attack}장</div>}
        </div>
      </div>

      {view.phase === 'over' ? (
        <div className="card result">
          <h2>🏆 {name(view.winner)}님 승리!</h2>
        </div>
      ) : (
        <p className={`status ${myTurn ? 'my-turn' : ''}`}>
          {myTurn
            ? view.attack > 0
              ? `공격을 받았습니다! 공격 카드로 막거나 더미를 눌러 ${view.attack}장 먹기`
              : '내 차례! 낼 카드를 고르거나 더미를 눌러 1장 가져가기'
            : `${name(view.current)}님 차례`}
        </p>
      )}

      {view.myHand && (
        <div className="hand">
          {view.myHand.map((c) => (
            <PlayingCard key={c} card={c} width={74} onClick={() => play(c)} disabled={!playing || !view.playable.includes(c)} selected={view.playable.includes(c)} />
          ))}
          {view.myHand.length === 0 && playing && <span className="muted">손패가 없습니다</span>}
        </div>
      )}
      {view.myHand && playing && (
        <p className="muted small-text center-text">
          손패 {view.myHand.length}장 · {view.maxHand}장이 되면 파산
        </p>
      )}

      {pickSuitFor && (
        <div className="modal-backdrop" onClick={() => setPickSuitFor(null)}>
          <div className="card modal" onClick={(e) => e.stopPropagation()}>
            <h3>어떤 무늬로 바꿀까요?</h3>
            <div className="row center">
              {SUITS.map((s) => (
                <button
                  key={s}
                  className="suit-btn"
                  onClick={() => {
                    act({ type: 'play', card: pickSuitFor, suit: s });
                    setPickSuitFor(null);
                  }}
                >
                  <svg viewBox="0 0 20 20" width={36} height={36}>
                    <SuitShape suit={s} />
                  </svg>
                  {SUIT_NAME[s]}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="row">
        {room.me === room.hostId && playing && !myTurn && (
          <button className="small" onClick={() => act({ type: 'forceDraw' })}>
            지금 차례인 사람 카드 먹이고 넘기기 (방장)
          </button>
        )}
      </div>
      <div className="card log-box">
        {[...view.log].reverse().slice(0, 8).map((l, i) => (
          <div key={i} className={i === 0 ? '' : 'muted'}>
            {l}
          </div>
        ))}
      </div>
    </div>
  );
}
