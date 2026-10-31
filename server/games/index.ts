import { blackjack } from './blackjack.ts';
import { drawing } from './drawing.ts';
import { gomoku } from './gomoku.ts';
import { liar } from './liar.ts';
import { mafia } from './mafia.ts';
import { oldmaid } from './oldmaid.ts';
import { onecard } from './onecard.ts';
import { trpg } from './trpg.ts';
import type { GameModule } from './types.ts';
import { wordchain } from './wordchain.ts';

// 새 게임을 추가하려면 모듈을 만들고 여기에 등록하면 된다
export const GAME_LIST: GameModule[] = [trpg, gomoku, liar, mafia, drawing, wordchain, onecard, oldmaid, blackjack];

export const GAMES: Record<string, GameModule> = Object.fromEntries(GAME_LIST.map((g) => [g.meta.id, g]));
