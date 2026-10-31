// 플레이어 id로 항상 같은 모양과 색이 나오는 아바타 (SVG)

const PALETTE = ['#e8590c', '#2f9e44', '#1971c2', '#7048e8', '#c2255c', '#0c8599', '#f08c00', '#5c940d', '#9c36b5', '#d6336c'];
const EYES = ['dot', 'happy', 'wink', 'sleepy'] as const;
const HATS = ['none', 'cap', 'crown', 'bow', 'antenna', 'none'] as const;

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function Avatar({ id, size = 28, dim = false }: { id: string; size?: number; dim?: boolean }) {
  const h = hash(id);
  const color = PALETTE[h % PALETTE.length];
  const eyes = EYES[(h >> 4) % EYES.length];
  const hat = HATS[(h >> 8) % HATS.length];
  const cheek = (h >> 12) % 2 === 0;
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} className="avatar" style={{ opacity: dim ? 0.4 : 1 }} aria-hidden="true">
      <circle cx="20" cy="22" r="16" fill={color} />
      {hat === 'cap' && <path d="M8 16Q20 2 32 16Z" fill="#343a40" />}
      {hat === 'crown' && <path d="M12 10 15 3 20 8 25 3 28 10Z" fill="#fcc419" />}
      {hat === 'bow' && <path d="M14 6 20 9 26 6 26 12 20 9 14 12Z" fill="#f06595" />}
      {hat === 'antenna' && (
        <>
          <line x1="20" y1="6" x2="20" y2="1" stroke="#343a40" strokeWidth="1.5" />
          <circle cx="20" cy="1.8" r="1.8" fill="#ffd43b" />
        </>
      )}
      {eyes === 'dot' && (
        <>
          <circle cx="14.5" cy="20" r="2.2" fill="#fff" />
          <circle cx="25.5" cy="20" r="2.2" fill="#fff" />
        </>
      )}
      {eyes === 'happy' && <path d="M12 21Q14.5 17 17 21M23 21Q25.5 17 28 21" stroke="#fff" strokeWidth="1.8" fill="none" strokeLinecap="round" />}
      {eyes === 'wink' && (
        <>
          <circle cx="14.5" cy="20" r="2.2" fill="#fff" />
          <path d="M23 20.5H28" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
        </>
      )}
      {eyes === 'sleepy' && <path d="M12 20H17M23 20H28" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />}
      <path d="M15 27Q20 31 25 27" stroke="#fff" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      {cheek && (
        <>
          <circle cx="11" cy="25" r="2" fill="#fff" opacity="0.35" />
          <circle cx="29" cy="25" r="2" fill="#fff" opacity="0.35" />
        </>
      )}
    </svg>
  );
}
