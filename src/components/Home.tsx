import { useState } from 'react';

interface Props {
  name: string;
  setName: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  passwordRequired: boolean;
  initialCode: string;
  busy: boolean;
  onCreate: () => void;
  onJoin: (code: string) => void;
}

export function Home(p: Props) {
  const [code, setCode] = useState(p.initialCode);
  return (
    <div className="home">
      <h1>🎲 PartyGame Table</h1>
      <p className="muted">친구들과 TRPG, 보드게임, 파티게임을 즐기는 테이블</p>
      <div className="card home-card">
        <label>
          닉네임
          <input value={p.name} maxLength={16} placeholder="예: 용사김철수" onChange={(e) => p.setName(e.target.value)} autoFocus />
        </label>
        {p.passwordRequired && (
          <label>
            입장 비밀번호
            <input type="password" value={p.password} placeholder="방장에게 받은 비밀번호" onChange={(e) => p.setPassword(e.target.value)} />
          </label>
        )}
        <button className="primary big" disabled={p.busy} onClick={p.onCreate}>
          새 방 만들기
        </button>
        <div className="divider">또는</div>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            p.onJoin(code);
          }}
        >
          <input value={code} maxLength={4} placeholder="방 코드 (4자리)" className="code-input" onChange={(e) => setCode(e.target.value.toUpperCase())} />
          <button disabled={p.busy || code.length !== 4}>입장</button>
        </form>
      </div>
    </div>
  );
}
