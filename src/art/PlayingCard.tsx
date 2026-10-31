import type { CSSProperties } from 'react';
import { parseCard, rankLabel, type CardId, type Suit } from '../../shared/cards.ts';

// 모든 그림은 코드로 그린 SVG라 외부 이미지 파일이나 라이선스가 필요 없다.

const RED = '#c92a2a';
const BLACK = '#1f2328';

/** 무늬 모양 (20×20 상자 기준) */
export function SuitShape({ suit, x = 0, y = 0, size = 20, flip = false, color }: { suit: Suit; x?: number; y?: number; size?: number; flip?: boolean; color?: string }) {
  const fill = color ?? (suit === 'H' || suit === 'D' ? RED : BLACK);
  const s = size / 20;
  const transform = `translate(${x} ${y}) scale(${s})${flip ? ' rotate(180 10 10)' : ''}`;
  return (
    <g transform={transform} fill={fill}>
      {suit === 'H' && <path d="M10 18C10 18 1 12 1 6.5 1 3.5 3.5 1.5 6 1.5 8 1.5 9.3 2.8 10 4.2 10.7 2.8 12 1.5 14 1.5 16.5 1.5 19 3.5 19 6.5 19 12 10 18 10 18Z" />}
      {suit === 'D' && <path d="M10 1 17.5 10 10 19 2.5 10Z" />}
      {suit === 'S' && (
        <path d="M10 1C10 1 1 7.5 1 12 1 14.8 3.2 16.5 5.6 16.5 7.3 16.5 8.6 15.6 9.3 14.5 9.1 16.5 8.3 18 6.5 19H13.5C11.7 18 10.9 16.5 10.7 14.5 11.4 15.6 12.7 16.5 14.4 16.5 16.8 16.5 19 14.8 19 12 19 7.5 10 1 10 1Z" />
      )}
      {suit === 'C' && (
        <>
          <circle cx="10" cy="5.6" r="4.4" />
          <circle cx="5" cy="11.4" r="4.4" />
          <circle cx="15" cy="11.4" r="4.4" />
          <path d="M9 10H11L11.8 17.5C12.3 18.3 13 18.7 14 19H6C7 18.7 7.7 18.3 8.2 17.5Z" />
        </>
      )}
    </g>
  );
}

// 숫자 카드의 무늬 배치 (가로 30/50/70, 세로 위치)
const L = 30;
const C = 50;
const R = 70;
const PIPS: Record<number, [number, number][]> = {
  2: [[C, 30], [C, 110]],
  3: [[C, 30], [C, 70], [C, 110]],
  4: [[L, 30], [R, 30], [L, 110], [R, 110]],
  5: [[L, 30], [R, 30], [C, 70], [L, 110], [R, 110]],
  6: [[L, 30], [R, 30], [L, 70], [R, 70], [L, 110], [R, 110]],
  7: [[L, 30], [R, 30], [C, 50], [L, 70], [R, 70], [L, 110], [R, 110]],
  8: [[L, 30], [R, 30], [C, 50], [L, 70], [R, 70], [C, 90], [L, 110], [R, 110]],
  9: [[L, 30], [R, 30], [L, 56], [R, 56], [C, 70], [L, 84], [R, 84], [L, 110], [R, 110]],
  10: [[L, 30], [R, 30], [C, 43], [L, 56], [R, 56], [L, 84], [R, 84], [C, 97], [L, 110], [R, 110]],
};

const FACE_COLORS: Record<number, { band: string; robe: string }> = {
  11: { band: '#1971c2', robe: '#4dabf7' },
  12: { band: '#c2255c', robe: '#f783ac' },
  13: { band: '#e67700', robe: '#ffd43b' },
};

function Face({ rank, suit, color }: { rank: number; suit: Suit; color: string }) {
  const c = FACE_COLORS[rank];
  return (
    <g>
      <rect x="20" y="22" width="60" height="96" rx="4" fill="#fff8e6" stroke={color} strokeWidth="1.5" />
      <rect x="20" y="62" width="60" height="16" fill={c.band} opacity="0.9" />
      {/* 왕관 / 모자 */}
      {rank === 13 && <path d="M36 44 40 32 46 40 50 28 54 40 60 32 64 44Z" fill="#fcc419" stroke="#b08900" strokeWidth="1" />}
      {rank === 12 && <path d="M38 44Q50 26 62 44Z" fill="#fcc419" stroke="#b08900" strokeWidth="1" />}
      {rank === 11 && <path d="M38 44 42 34H58L62 44Z" fill={c.robe} stroke={c.band} strokeWidth="1" />}
      <circle cx="50" cy="52" r="8" fill="#ffe8cc" stroke="#d9a066" strokeWidth="1" />
      <text x="50" y="74.5" textAnchor="middle" fontSize="13" fontWeight="800" fill="#fff" fontFamily="Georgia, serif">
        {rankLabel(rank)}
      </text>
      {/* 아래쪽은 위쪽을 뒤집은 모양 */}
      <g transform="rotate(180 50 70)">
        {rank === 13 && <path d="M36 44 40 32 46 40 50 28 54 40 60 32 64 44Z" fill="#fcc419" stroke="#b08900" strokeWidth="1" />}
        {rank === 12 && <path d="M38 44Q50 26 62 44Z" fill="#fcc419" stroke="#b08900" strokeWidth="1" />}
        {rank === 11 && <path d="M38 44 42 34H58L62 44Z" fill={c.robe} stroke={c.band} strokeWidth="1" />}
        <circle cx="50" cy="52" r="8" fill="#ffe8cc" stroke="#d9a066" strokeWidth="1" />
      </g>
      <SuitShape suit={suit} x={24} y={26} size={11} />
      <SuitShape suit={suit} x={65} y={103} size={11} flip />
    </g>
  );
}

function Joker({ red }: { red: boolean }) {
  const main = red ? RED : BLACK;
  const alt = red ? '#fab005' : '#868e96';
  return (
    <g>
      <path d="M30 70 40 40 50 62 60 40 70 70Z" fill={main} />
      <path d="M40 40 50 62 60 40" fill="none" stroke={alt} strokeWidth="2" />
      <circle cx="40" cy="38" r="4" fill={alt} />
      <circle cx="60" cy="38" r="4" fill={alt} />
      <circle cx="50" cy="80" r="11" fill="#ffe8cc" stroke="#d9a066" />
      <path d="M44 82Q50 88 56 82" fill="none" stroke={main} strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="46" cy="78" r="1.4" fill={BLACK} />
      <circle cx="54" cy="78" r="1.4" fill={BLACK} />
      <path d="M35 98H65L60 110H40Z" fill={main} />
      <text x="50" y="128" textAnchor="middle" fontSize="11" fontWeight="800" fill={main} letterSpacing="2" fontFamily="Georgia, serif">
        JOKER
      </text>
    </g>
  );
}

export function CardBack({ variant = 'blue' }: { variant?: 'blue' | 'red' }) {
  const a = variant === 'blue' ? '#1c4f8a' : '#9c1d2a';
  const b = variant === 'blue' ? '#2f74c0' : '#d0394a';
  const id = `back-${variant}`;
  return (
    <>
      <defs>
        <pattern id={id} width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="10" height="10" fill={a} />
          <rect width="5" height="5" fill={b} />
        </pattern>
      </defs>
      <rect x="1" y="1" width="98" height="138" rx="8" fill="#fff" stroke="#adb5bd" />
      <rect x="7" y="7" width="86" height="126" rx="5" fill={`url(#${id})`} />
      <circle cx="50" cy="70" r="16" fill="#fff" opacity="0.92" />
      <text x="50" y="77" textAnchor="middle" fontSize="20">
        🎲
      </text>
    </>
  );
}

interface Props {
  card?: CardId | null; // 없으면 뒷면
  width?: number;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  back?: 'blue' | 'red';
  style?: CSSProperties;
  title?: string;
}

export function PlayingCard({ card, width = 72, selected, disabled, onClick, back = 'blue', style, title }: Props) {
  const parsed = card ? parseCard(card) : null;
  const color = parsed?.red ? RED : BLACK;
  const className = ['pcard', onClick && !disabled ? 'clickable' : '', selected ? 'selected' : '', disabled ? 'disabled' : ''].join(' ');
  const svg = (
    <svg viewBox="0 0 100 140" width={width} height={width * 1.4} aria-hidden="true">
      {!parsed ? (
        <CardBack variant={back} />
      ) : (
        <>
          <rect x="1" y="1" width="98" height="138" rx="8" fill="#fff" stroke="#adb5bd" />
          {parsed.joker ? (
            <>
              <Joker red={parsed.red} />
              <text x="9" y="22" fontSize="14" fontWeight="800" fill={color} fontFamily="Georgia, serif">
                ★
              </text>
            </>
          ) : (
            <>
              {/* 모서리 표시 */}
              <text x="11" y="21" textAnchor="middle" fontSize="16" fontWeight="800" fill={color} fontFamily="Georgia, serif">
                {rankLabel(parsed.rank)}
              </text>
              <SuitShape suit={parsed.suit!} x={5} y={24} size={12} />
              <g transform="rotate(180 50 70)">
                <text x="11" y="21" textAnchor="middle" fontSize="16" fontWeight="800" fill={color} fontFamily="Georgia, serif">
                  {rankLabel(parsed.rank)}
                </text>
                <SuitShape suit={parsed.suit!} x={5} y={24} size={12} />
              </g>
              {parsed.rank === 1 && <SuitShape suit={parsed.suit!} x={28} y={48} size={44} />}
              {parsed.rank >= 2 && parsed.rank <= 10 && PIPS[parsed.rank].map(([x, y], i) => <SuitShape key={i} suit={parsed.suit!} x={x - 9} y={y - 9} size={18} flip={y > 70} />)}
              {parsed.rank >= 11 && <Face rank={parsed.rank} suit={parsed.suit!} color={color} />}
            </>
          )}
        </>
      )}
    </svg>
  );
  if (onClick) {
    return (
      <button type="button" className={className} style={style} onClick={onClick} disabled={disabled} title={title} aria-label={title ?? card ?? '카드'}>
        {svg}
      </button>
    );
  }
  return (
    <span className={className} style={style} title={title}>
      {svg}
    </span>
  );
}

/** 카지노 칩 */
export function Chip({ value, size = 28 }: { value: number; size?: number }) {
  const color = value >= 500 ? '#5f3dc4' : value >= 100 ? '#1f2328' : value >= 50 ? '#2b8a3e' : value >= 25 ? '#c92a2a' : '#1971c2';
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} className="chip-svg" aria-hidden="true">
      <circle cx="20" cy="20" r="19" fill={color} />
      <circle cx="20" cy="20" r="19" fill="none" stroke="#fff" strokeWidth="5" strokeDasharray="6 8.9" />
      <circle cx="20" cy="20" r="12" fill="#fff" />
      <circle cx="20" cy="20" r="10.5" fill="none" stroke={color} strokeWidth="1" />
      <text x="20" y="24" textAnchor="middle" fontSize={value >= 100 ? 9 : 11} fontWeight="800" fill={color}>
        {value}
      </text>
    </svg>
  );
}

/** 칩 금액을 칩 몇 개로 보여준다 */
export function ChipStack({ amount, size = 22 }: { amount: number; size?: number }) {
  const chips: number[] = [];
  let rest = amount;
  for (const v of [500, 100, 50, 25, 10]) {
    while (rest >= v && chips.length < 8) {
      chips.push(v);
      rest -= v;
    }
  }
  return (
    <span className="chip-stack" title={`${amount}`}>
      {chips.map((v, i) => (
        <span key={i} style={{ marginLeft: i ? -size * 0.55 : 0 }}>
          <Chip value={v} size={size} />
        </span>
      ))}
      <b>{amount.toLocaleString()}</b>
    </span>
  );
}
