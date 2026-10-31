// 트럼프 카드 공통 정의. 카드는 짧은 문자열로 주고받는다.
// 예: "S1" = 스페이드 A, "H10" = 하트 10, "D13" = 다이아 K, "JB" = 흑백 조커, "JR" = 컬러 조커

export type Suit = 'S' | 'H' | 'D' | 'C';
export type CardId = string;

export const SUITS: Suit[] = ['S', 'H', 'D', 'C'];
export const SUIT_SYMBOL: Record<Suit, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };
export const SUIT_NAME: Record<Suit, string> = { S: '스페이드', H: '하트', D: '다이아', C: '클로버' };

export interface ParsedCard {
  id: CardId;
  suit: Suit | null; // 조커는 null
  rank: number; // 1(A)~13(K), 조커는 0
  joker: 'B' | 'R' | null;
  red: boolean;
}

export function parseCard(id: CardId): ParsedCard {
  if (id === 'JB' || id === 'JR') return { id, suit: null, rank: 0, joker: id[1] as 'B' | 'R', red: id === 'JR' };
  const suit = id[0] as Suit;
  return { id, suit, rank: Number(id.slice(1)), joker: null, red: suit === 'H' || suit === 'D' };
}

export function rankLabel(rank: number): string {
  return rank === 1 ? 'A' : rank === 11 ? 'J' : rank === 12 ? 'Q' : rank === 13 ? 'K' : String(rank);
}

export function cardLabel(id: CardId): string {
  const c = parseCard(id);
  if (c.joker) return c.joker === 'B' ? '흑백 조커' : '컬러 조커';
  return `${SUIT_SYMBOL[c.suit!]}${rankLabel(c.rank)}`;
}

export function makeDeck(jokers: ('JB' | 'JR')[] = []): CardId[] {
  const deck: CardId[] = [];
  for (const s of SUITS) for (let r = 1; r <= 13; r++) deck.push(`${s}${r}`);
  return [...deck, ...jokers];
}

/** 손패 정렬: 무늬 → 숫자 순, 조커는 맨 뒤 */
export function sortHand(hand: CardId[]): CardId[] {
  return [...hand].sort((a, b) => {
    const pa = parseCard(a);
    const pb = parseCard(b);
    if (!pa.suit || !pb.suit) return (pa.suit ? 0 : 1) - (pb.suit ? 0 : 1);
    return SUITS.indexOf(pa.suit) - SUITS.indexOf(pb.suit) || pa.rank - pb.rank;
  });
}
