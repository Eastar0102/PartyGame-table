import type { FC } from 'react';
import { Blackjack } from './Blackjack.tsx';
import type { GameProps } from './common.tsx';
import { Drawing } from './Drawing.tsx';
import { Gomoku } from './Gomoku.tsx';
import { Liar } from './Liar.tsx';
import { Mafia } from './Mafia.tsx';
import { OldMaid } from './OldMaid.tsx';
import { OneCard } from './OneCard.tsx';
import { Trpg } from './Trpg.tsx';
import { WordChain } from './WordChain.tsx';

export const GAME_UI: Record<string, { Component: FC<GameProps> }> = {
  trpg: { Component: Trpg },
  gomoku: { Component: Gomoku },
  liar: { Component: Liar },
  mafia: { Component: Mafia },
  drawing: { Component: Drawing },
  wordchain: { Component: WordChain },
  onecard: { Component: OneCard },
  oldmaid: { Component: OldMaid },
  blackjack: { Component: Blackjack },
};
