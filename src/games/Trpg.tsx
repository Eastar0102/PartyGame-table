import { useEffect, useRef, useState } from 'react';
import { act } from '../socket.ts';
import { useNames, type GameProps } from './common.tsx';

interface Roll {
  id: number;
  by: string;
  byName: string;
  expression: string;
  label: string;
  total: number | null;
  detail: string;
  secret: boolean;
}
interface Sheet {
  name: string;
  hp: number;
  maxHp: number;
  notes: string;
}
interface View {
  gmId: string;
  isGm: boolean;
  rolls: Roll[];
  sharedNotes: string;
  gmNotes: string | null;
  sheets: Record<string, Sheet>;
}

const QUICK = ['d20', '2d6', 'd100', '4d6kh3', 'd4', 'd8', 'd12'];

/** 다른 사람이 고친 내용은 반영하되, 내가 입력 중일 때는 덮어쓰지 않는 텍스트 영역 */
function SyncedTextarea({ value, onSave, placeholder, disabled }: { value: string; onSave: (v: string) => void; placeholder: string; disabled?: boolean }) {
  const [local, setLocal] = useState(value);
  const editing = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    if (!editing.current) setLocal(value);
  }, [value]);
  return (
    <textarea
      value={local}
      placeholder={placeholder}
      disabled={disabled}
      onFocus={() => (editing.current = true)}
      onBlur={() => {
        editing.current = false;
        clearTimeout(timer.current);
        if (local !== value) onSave(local);
      }}
      onChange={(e) => {
        setLocal(e.target.value);
        clearTimeout(timer.current);
        const v = e.target.value;
        timer.current = setTimeout(() => onSave(v), 600);
      }}
    />
  );
}

export function Trpg({ view, room }: GameProps<View>) {
  const name = useNames(room);
  const [expr, setExpr] = useState('');
  const [label, setLabel] = useState('');
  const [secret, setSecret] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const lastRoll = view.rolls[view.rolls.length - 1]?.id;

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lastRoll]);

  const roll = async (expression: string) => {
    if (await act({ type: 'roll', expression, label, secret })) setLabel('');
  };

  const mySheet = view.sheets[room.me] ?? { name: '', hp: 10, maxHp: 10, notes: '' };

  return (
    <div className="trpg">
      <div className="trpg-top">
        <div className="card dice-box">
          <h3>🎲 주사위</h3>
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              if (expr.trim()) roll(expr);
            }}
          >
            <input value={expr} placeholder="예: 2d6+3, 4d6kh3" onChange={(e) => setExpr(e.target.value)} />
            <button className="primary">굴리기</button>
          </form>
          <div className="row wrap">
            {QUICK.map((q) => (
              <button key={q} className="small" onClick={() => roll(q)}>
                {q}
              </button>
            ))}
          </div>
          <div className="row">
            <input value={label} maxLength={40} placeholder="무엇을 굴리나요? (예: 은신 판정)" onChange={(e) => setLabel(e.target.value)} />
            <label className="check">
              <input type="checkbox" checked={secret} onChange={(e) => setSecret(e.target.checked)} />
              비밀 굴림
            </label>
          </div>
          <p className="muted small-text">kh3 = 높은 3개만, kl1 = 낮은 1개만. 비밀 굴림은 나와 GM만 결과를 봅니다.</p>
        </div>
        <div className="card roll-log" ref={logRef}>
          {view.rolls.length === 0 && <p className="muted">아직 굴린 주사위가 없습니다.</p>}
          {view.rolls.map((r) => (
            <div key={r.id} className={`roll ${r.by === room.me ? 'mine' : ''}`}>
              <span className="roll-who">{r.byName}</span>
              {r.total === null ? (
                <span className="muted">🤫 비밀 굴림을 했습니다</span>
              ) : (
                <>
                  {r.label && <span className="roll-label">{r.label}</span>}
                  <span className="muted">{r.expression}</span>
                  <span className="muted small-text">{r.detail}</span>
                  <b className="roll-total">{r.total}</b>
                  {r.secret && <span className="tag">비밀</span>}
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="trpg-bottom">
        <div className="card">
          <h3>📜 공용 메모</h3>
          <SyncedTextarea value={view.sharedNotes} placeholder="모두가 보고 고칠 수 있는 메모 (지도, 퀘스트, NPC 이름…)" onSave={(text) => act({ type: 'sharedNotes', text })} />
          {view.isGm && (
            <>
              <h3>🔒 GM 전용 메모</h3>
              <SyncedTextarea value={view.gmNotes ?? ''} placeholder="나만 보는 시나리오 메모" onSave={(text) => act({ type: 'gmNotes', text })} />
            </>
          )}
        </div>
        <div className="card sheets">
          <h3>
            🧙 캐릭터 시트 <span className="muted small-text">GM: {name(view.gmId)}</span>
          </h3>
          <div className="sheet mine">
            <div className="row">
              <input
                defaultValue={mySheet.name}
                key={`n-${mySheet.name}`}
                placeholder="내 캐릭터 이름"
                onBlur={(e) => e.target.value !== mySheet.name && act({ type: 'sheet', name: e.target.value })}
              />
              <HpControl sheet={mySheet} onChange={(hp, maxHp) => act({ type: 'sheet', hp, maxHp })} />
            </div>
            <SyncedTextarea value={mySheet.notes} placeholder="능력치, 장비, 특기…" onSave={(notes) => act({ type: 'sheet', notes })} />
          </div>
          {room.players
            .filter((p) => p.id !== room.me)
            .map((p) => {
              const s = view.sheets[p.id];
              return (
                <div key={p.id} className="sheet">
                  <div className="row">
                    <b>{s?.name || '(이름 없음)'}</b>
                    <span className="muted">{p.name}</span>
                    {s && view.isGm ? (
                      <HpControl sheet={s} onChange={(hp, maxHp) => act({ type: 'sheet', playerId: p.id, hp, maxHp })} />
                    ) : (
                      s && (
                        <span>
                          ❤️ {s.hp}/{s.maxHp}
                        </span>
                      )
                    )}
                  </div>
                  {s?.notes && <pre className="sheet-notes">{s.notes}</pre>}
                </div>
              );
            })}
          {room.me === view.gmId || room.me === room.hostId ? (
            <label className="gm-select">
              GM 바꾸기
              <select value={view.gmId} onChange={(e) => act({ type: 'setGm', playerId: e.target.value })}>
                {room.players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function HpControl({ sheet, onChange }: { sheet: Sheet; onChange: (hp: number, maxHp: number) => void }) {
  return (
    <span className="hp">
      ❤️
      <button className="tiny" onClick={() => onChange(sheet.hp - 1, sheet.maxHp)}>
        −
      </button>
      <b>{sheet.hp}</b>
      <button className="tiny" onClick={() => onChange(sheet.hp + 1, sheet.maxHp)}>
        +
      </button>
      /
      <input
        className="num"
        type="number"
        defaultValue={sheet.maxHp}
        key={`m-${sheet.maxHp}`}
        onBlur={(e) => Number(e.target.value) !== sheet.maxHp && onChange(sheet.hp, Number(e.target.value))}
      />
    </span>
  );
}
