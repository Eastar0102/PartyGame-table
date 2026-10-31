import { useState } from 'react';
import type { CardId } from '../../shared/cards.ts';
import { Avatar } from '../art/Avatar.tsx';
import { Chip, ChipStack, PlayingCard } from '../art/PlayingCard.tsx';
import { act } from '../socket.ts';
import { play, useSoundOn, useTurnSound } from '../sound.ts';
import { useNames, type GameProps } from './common.tsx';

interface HandView {
  cards: CardId[];
  bet: number;
  stood: boolean;
  doubled: boolean;
  result: null | 'blackjack' | 'win' | 'push' | 'lose' | 'bust';
  payout: number;
  value: number;
  soft: boolean;
}

interface View {
  phase: 'betting' | 'playing' | 'settled';
  seats: string[];
  chips: Record<string, number>;
  bets: Record<string, number>;
  hands: Record<string, HandView>;
  order: string[];
  current: string | null;
  dealer: (CardId | null)[];
  dealerValue: number;
  round: number;
  minBet: number;
}

const RESULT_TEXT: Record<NonNullable<HandView['result']>, string> = {
  blackjack: '블랙잭!',
  win: '승리',
  push: '무승부',
  lose: '패배',
  bust: '버스트',
};

export function Blackjack({ view, room }: GameProps<View>) {
  const name = useNames(room);
  const [bet, setBet] = useState(0);
  const me = room.me;
  const myTurn = view.current === me;
  const myChips = view.chips[me] ?? 0;
  const myHand = view.hands[me];
  const seated = view.seats.includes(me);
  const cardCount = Object.values(view.hands).reduce((n, h) => n + h.cards.length, 0) + view.dealer.length;

  useTurnSound(myTurn);
  useSoundOn(cardCount, (now, prev) => (now > prev ? (now - prev > 3 ? 'deal' : 'card') : null));
  useSoundOn(view.phase, (p) => {
    if (p !== 'settled' || !myHand?.result) return null;
    return myHand.result === 'win' || myHand.result === 'blackjack' ? 'win' : myHand.result === 'push' ? 'chip' : 'fail';
  });

  const addBet = (v: number) => {
    setBet((b) => Math.min(myChips, b + v));
    play('chip');
  };

  return (
    <div className="cardgame blackjack">
      <div className="felt column">
        <div className="dealer">
          <b>딜러</b> <span className="value-badge">{view.dealer.length ? view.dealerValue : '-'}</span>
          <div className="hand tight">
            {view.dealer.map((c, i) => (
              <PlayingCard key={i} card={c} width={70} back="red" />
            ))}
          </div>
          <span className="muted small-text" style={{ color: '#cfe' }}>
            딜러는 17 이상이 될 때까지 뽑습니다 · 블랙잭은 1.5배
          </span>
        </div>
      </div>

      <div className="bj-seats">
        {view.seats.map((id) => {
          const h = view.hands[id];
          const inRound = view.order.includes(id);
          return (
            <div key={id} className={`bj-seat ${view.current === id ? 'active' : ''} ${id === me ? 'mine' : ''}`}>
              <div className="row">
                <Avatar id={id} size={26} />
                <b>{name(id)}</b>
              </div>
              <ChipStack amount={view.chips[id] ?? 0} size={18} />
              {view.phase === 'betting' && <div className="muted small-text">{view.bets[id] ? `베팅 ${view.bets[id]} ✅` : '베팅 고르는 중…'}</div>}
              {h && inRound && (
                <>
                  <div className="hand tight">
                    {h.cards.map((c, i) => (
                      <PlayingCard key={i} card={c} width={48} />
                    ))}
                  </div>
                  <div className="small-text">
                    <span className="value-badge">{h.value}</span> 베팅 {h.bet}
                    {h.doubled && ' (더블)'}
                  </div>
                  {h.result && (
                    <div className={`result-badge ${h.payout > 0 ? 'good' : h.payout < 0 ? 'bad' : ''}`}>
                      {RESULT_TEXT[h.result]} {h.payout > 0 ? `+${h.payout}` : h.payout < 0 ? h.payout : ''}
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      {seated && view.phase === 'betting' && !view.bets[me] && (
        <div className="card controls">
          {myChips < view.minBet ? (
            <>
              <p>칩이 다 떨어졌습니다 😢</p>
              <button className="primary" onClick={() => act({ type: 'rebuy' })}>
                칩 500개 충전
              </button>
            </>
          ) : (
            <>
              <div className="row center wrap">
                {[10, 25, 50, 100, 500].map((v) => (
                  <button key={v} className="chip-btn" onClick={() => addBet(v)} disabled={bet + v > myChips} aria-label={`${v} 추가`}>
                    <Chip value={v} size={44} />
                  </button>
                ))}
              </div>
              <div className="row center">
                <span className="big-text">베팅 {bet}</span>
                <button className="small" onClick={() => setBet(0)}>
                  초기화
                </button>
                <button className="small" onClick={() => setBet(myChips)}>
                  올인
                </button>
                <button
                  className="primary"
                  disabled={bet < view.minBet}
                  onClick={async () => {
                    if (await act({ type: 'bet', amount: bet })) setBet(0);
                  }}
                >
                  베팅하기
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {myTurn && myHand && (
        <div className="card controls">
          <p className="status my-turn">
            내 차례! 지금 {myHand.value}점{myHand.soft ? ' (A를 11로 계산 중)' : ''}
          </p>
          <div className="row center">
            <button className="primary big" onClick={() => act({ type: 'hit' })}>
              히트 (한 장 더)
            </button>
            <button className="big" onClick={() => act({ type: 'stand' })}>
              스탠드 (그만)
            </button>
            <button className="big" disabled={myHand.cards.length !== 2 || myChips < myHand.bet} onClick={() => act({ type: 'double' })}>
              더블다운
            </button>
          </div>
        </div>
      )}

      {view.phase === 'playing' && !myTurn && <p className="status">{name(view.current)}님 차례</p>}

      <div className="row center">
        {view.phase === 'settled' && (
          <button className="primary" onClick={() => act({ type: 'next' })}>
            다음 판
          </button>
        )}
        {room.me === room.hostId && view.phase === 'betting' && (
          <button className="small" onClick={() => act({ type: 'deal' })}>
            베팅한 사람끼리 바로 시작 (방장)
          </button>
        )}
        {room.me === room.hostId && view.phase === 'playing' && !myTurn && (
          <button className="small" onClick={() => act({ type: 'skip' })}>
            이 사람 스탠드 처리 (방장)
          </button>
        )}
      </div>
    </div>
  );
}
