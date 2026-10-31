import type { FC } from 'react';
import type { GameProps } from './common.tsx';
import { Drawing } from './Drawing.tsx';
import { Gomoku } from './Gomoku.tsx';
import { Liar } from './Liar.tsx';
import { Mafia } from './Mafia.tsx';
import { Trpg } from './Trpg.tsx';
import { WordChain } from './WordChain.tsx';

export interface OptionDef {
  key: string;
  label: string;
  default: string;
  choices: { value: string; label: string }[];
}

export const GAME_UI: Record<string, { Component: FC<GameProps>; options?: OptionDef[] }> = {
  trpg: { Component: Trpg },
  gomoku: { Component: Gomoku },
  liar: {
    Component: Liar,
    options: [
      {
        key: 'category',
        label: '주제',
        default: 'random',
        choices: [{ value: 'random', label: '무작위' }, ...['음식', '동물', '장소', '직업', '스포츠', '물건'].map((c) => ({ value: c, label: c }))],
      },
      { key: 'hintRounds', label: '설명 바퀴 수', default: '1', choices: [{ value: '1', label: '1바퀴' }, { value: '2', label: '2바퀴' }] },
    ],
  },
  mafia: { Component: Mafia },
  drawing: {
    Component: Drawing,
    options: [
      { key: 'rounds', label: '라운드 (모두 한 번씩 그리기)', default: '1', choices: ['1', '2', '3'].map((v) => ({ value: v, label: `${v}라운드` })) },
      { key: 'turnSeconds', label: '그리는 시간', default: '80', choices: ['60', '80', '100'].map((v) => ({ value: v, label: `${v}초` })) },
    ],
  },
  wordchain: {
    Component: WordChain,
    options: [{ key: 'turnSeconds', label: '제한 시간', default: '15', choices: ['10', '15', '20', '30'].map((v) => ({ value: v, label: `${v}초` })) }],
  },
};
