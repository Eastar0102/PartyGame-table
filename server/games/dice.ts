// 주사위 표기법 파서: "2d6+3", "d20", "4d6kh3"(높은 3개), "2d20kl1"(낮은 1개), "1d8+1d6-2"

export interface DiceTerm {
  kind: 'dice';
  sign: 1 | -1;
  count: number;
  sides: number;
  keep?: { mode: 'h' | 'l'; n: number };
  rolls: number[];
  kept: number[];
}

export interface ConstTerm {
  kind: 'const';
  sign: 1 | -1;
  value: number;
}

export interface RollResult {
  expression: string;
  terms: (DiceTerm | ConstTerm)[];
  total: number;
  /** 사람이 읽기 좋은 계산 과정, 예: "[3, 5] + 3" */
  detail: string;
}

const TERM_RE = /^([+-])?(?:(\d*)d(\d+)(?:k([hl])(\d+))?|(\d+))/i;

export function rollDice(input: string, random: () => number = Math.random): RollResult {
  const expression = input.replace(/\s+/g, '').toLowerCase();
  if (!expression) throw new Error('주사위 식을 입력해 주세요. 예: 2d6+3');
  if (expression.length > 60) throw new Error('식이 너무 깁니다.');
  const terms: (DiceTerm | ConstTerm)[] = [];
  let rest = expression;
  let totalDice = 0;
  while (rest.length > 0) {
    const m = TERM_RE.exec(rest);
    if (!m || (terms.length > 0 && !m[1])) throw new Error(`이해할 수 없는 식입니다: ${input}`);
    const sign: 1 | -1 = m[1] === '-' ? -1 : 1;
    if (m[6] !== undefined) {
      terms.push({ kind: 'const', sign, value: Number(m[6]) });
    } else {
      const count = m[2] ? Number(m[2]) : 1;
      const sides = Number(m[3]);
      if (count < 1 || sides < 2) throw new Error('주사위 개수는 1개 이상, 면 수는 2 이상이어야 합니다.');
      totalDice += count;
      if (totalDice > 100 || sides > 1000) throw new Error('주사위가 너무 많거나 큽니다. (최대 100개, 1000면)');
      const rolls = Array.from({ length: count }, () => 1 + Math.floor(random() * sides));
      let kept = rolls;
      let keep: DiceTerm['keep'];
      if (m[4]) {
        const n = Math.min(Number(m[5]), count);
        keep = { mode: m[4] as 'h' | 'l', n };
        const sorted = [...rolls].sort((a, b) => (keep!.mode === 'h' ? b - a : a - b));
        kept = sorted.slice(0, n);
      }
      terms.push({ kind: 'dice', sign, count, sides, keep, rolls, kept });
    }
    rest = rest.slice(m[0].length);
  }
  let total = 0;
  const parts: string[] = [];
  terms.forEach((t, i) => {
    const value = t.kind === 'const' ? t.value : t.kept.reduce((a, b) => a + b, 0);
    total += t.sign * value;
    const text = t.kind === 'const' ? String(t.value) : `[${t.rolls.join(', ')}]${t.keep ? `→${value}` : ''}`;
    parts.push(i === 0 ? (t.sign < 0 ? `-${text}` : text) : `${t.sign < 0 ? '-' : '+'} ${text}`);
  });
  return { expression, terms, total, detail: parts.join(' ') };
}
