import { rollDice } from './dice.ts';
import { nameOf, type GameModule } from './types.ts';

interface RollEntry {
  id: number;
  at: number;
  by: string;
  byName: string;
  expression: string;
  label: string;
  total: number;
  detail: string;
  secret: boolean;
}

interface Sheet {
  name: string;
  hp: number;
  maxHp: number;
  notes: string;
}

interface TrpgState {
  gmId: string;
  rolls: RollEntry[];
  seq: number;
  sharedNotes: string;
  gmNotes: string;
  sheets: Record<string, Sheet>;
}

const MAX_ROLLS = 100;

export const trpg: GameModule<TrpgState> = {
  meta: {
    id: 'trpg',
    name: 'TRPG 테이블',
    emoji: '🎲',
    description: '주사위 굴리기(2d6+3, 4d6kh3), GM 비밀 굴림, 캐릭터 시트와 공용 메모. 규칙은 여러분 마음대로!',
    minPlayers: 1,
    maxPlayers: 20,
  },

  setup(ctx) {
    return { gmId: ctx.hostId, rolls: [], seq: 0, sharedNotes: '', gmNotes: '', sheets: {} };
  },

  action(state, pid, action, ctx) {
    const isGm = pid === state.gmId;
    switch (action.type) {
      case 'roll': {
        const expr = String(action.expression ?? '');
        let result;
        try {
          result = rollDice(expr, ctx.random);
        } catch (e) {
          return e instanceof Error ? e.message : '굴릴 수 없습니다.';
        }
        const label = String(action.label ?? '').trim().slice(0, 40);
        const secret = !!action.secret;
        const entry: RollEntry = {
          id: ++state.seq,
          at: ctx.now,
          by: pid,
          byName: nameOf(ctx, pid),
          expression: result.expression,
          label,
          total: result.total,
          detail: result.detail,
          secret,
        };
        state.rolls.push(entry);
        if (state.rolls.length > MAX_ROLLS) state.rolls.shift();
        return;
      }
      case 'sharedNotes':
        state.sharedNotes = String(action.text ?? '').slice(0, 5000);
        return;
      case 'gmNotes':
        if (!isGm) return 'GM만 쓸 수 있습니다.';
        state.gmNotes = String(action.text ?? '').slice(0, 5000);
        return;
      case 'sheet': {
        const target = typeof action.playerId === 'string' ? action.playerId : pid;
        if (target !== pid && !isGm) return '다른 사람의 시트는 GM만 고칠 수 있습니다.';
        const prev = state.sheets[target] ?? { name: '', hp: 10, maxHp: 10, notes: '' };
        const num = (v: unknown, d: number) => (Number.isFinite(Number(v)) ? Math.max(-999, Math.min(9999, Math.round(Number(v)))) : d);
        state.sheets[target] = {
          name: action.name !== undefined ? String(action.name).slice(0, 30) : prev.name,
          hp: action.hp !== undefined ? num(action.hp, prev.hp) : prev.hp,
          maxHp: action.maxHp !== undefined ? num(action.maxHp, prev.maxHp) : prev.maxHp,
          notes: action.notes !== undefined ? String(action.notes).slice(0, 2000) : prev.notes,
        };
        return;
      }
      case 'setGm': {
        if (!isGm && pid !== ctx.hostId) return 'GM이나 방장만 GM을 넘길 수 있습니다.';
        const target = String(action.playerId ?? '');
        if (!ctx.roomPlayers.some((p) => p.id === target)) return '그 사람은 방에 없습니다.';
        state.gmId = target;
        ctx.announce(`${nameOf(ctx, target)}님이 GM이 되었습니다.`);
        return;
      }
      case 'clearRolls':
        if (!isGm) return 'GM만 기록을 지울 수 있습니다.';
        state.rolls = [];
        return;
      default:
        return '알 수 없는 행동입니다.';
    }
  },

  view(state, viewerId) {
    const isGm = viewerId === state.gmId;
    return {
      gmId: state.gmId,
      isGm,
      rolls: state.rolls.map((r) =>
        r.secret && !isGm && r.by !== viewerId ? { ...r, total: null, detail: '', expression: '???', label: '' } : r,
      ),
      sharedNotes: state.sharedNotes,
      gmNotes: isGm ? state.gmNotes : null,
      sheets: state.sheets,
    };
  },
};
