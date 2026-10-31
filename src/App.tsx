import { useCallback, useEffect, useRef, useState } from 'react';
import type { RoomState, ServerInfo } from '../shared/types.ts';
import { Home } from './components/Home.tsx';
import { Room } from './components/Room.tsx';
import { getToken, onActionError, request, socket } from './socket.ts';

function codeFromHash(): string {
  const m = /^#\/([A-Za-z0-9]{4})$/.exec(location.hash);
  return m ? m[1].toUpperCase() : '';
}

export function App() {
  const [info, setInfo] = useState<ServerInfo | null>(null);
  const [name, setName] = useState(() => localStorage.getItem('pgt-name') ?? '');
  const [password, setPassword] = useState(() => localStorage.getItem('pgt-password') ?? '');
  const [room, setRoom] = useState<RoomState | null>(null);
  const [connected, setConnected] = useState(socket.connected);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // 재접속할 때 다시 들어갈 방 코드
  const activeCode = useRef<string>('');
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const showError = useCallback((msg: string) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);

  useEffect(() => onActionError(showError), [showError]);

  useEffect(() => {
    fetch('/api/info')
      .then((r) => r.json())
      .then(setInfo)
      .catch(() => setInfo({ passwordRequired: false, publicUrl: null }));
  }, []);

  const enter = useCallback(
    async (mode: 'create' | 'join', code: string, opts?: { silent?: boolean }) => {
      const n = name.trim();
      if (!n) return showError('닉네임을 입력해 주세요.');
      setBusy(true);
      const payload = { token: getToken(), name: n, password: password || undefined };
      const res =
        mode === 'create'
          ? await request<{ code: string }>((ack) => socket.emit('room:create', payload, ack))
          : await request<{ code: string }>((ack) => socket.emit('room:join', { ...payload, code }, ack));
      setBusy(false);
      if (!res.ok) {
        if (!opts?.silent) showError(res.error);
        activeCode.current = '';
        return;
      }
      localStorage.setItem('pgt-name', n);
      if (password) localStorage.setItem('pgt-password', password);
      activeCode.current = res.code;
      if (location.hash !== `#/${res.code}`) history.replaceState(null, '', `#/${res.code}`);
    },
    [name, password, showError],
  );

  useEffect(() => {
    const onState = (s: RoomState) => setRoom(s);
    const onKicked = () => {
      activeCode.current = '';
      setRoom(null);
      history.replaceState(null, '', location.pathname);
      showError('방에서 나가게 되었습니다. (강퇴되었거나 다른 탭에서 접속함)');
    };
    const onConnect = () => {
      setConnected(true);
      // 서버가 재시작되었거나 네트워크가 끊겼다 돌아온 경우 같은 방에 다시 들어간다
      if (activeCode.current) enter('join', activeCode.current, { silent: true });
    };
    const onDisconnect = () => setConnected(false);
    socket.on('room:state', onState);
    socket.on('room:kicked', onKicked);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    return () => {
      socket.off('room:state', onState);
      socket.off('room:kicked', onKicked);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, [enter, showError]);

  // 초대 링크(#/CODE)로 들어왔고 닉네임이 저장되어 있으면 바로 입장
  const autoJoined = useRef(false);
  useEffect(() => {
    if (autoJoined.current || !info) return;
    autoJoined.current = true;
    const code = codeFromHash();
    if (code && name.trim() && (!info.passwordRequired || password)) enter('join', code, { silent: true });
  }, [info, name, password, enter]);

  const leave = () => {
    socket.emit('room:leave');
    activeCode.current = '';
    setRoom(null);
    history.replaceState(null, '', location.pathname);
  };

  return (
    <>
      {!connected && <div className="banner">서버와 연결이 끊겼습니다. 다시 연결하는 중…</div>}
      {room ? (
        <Room room={room} publicUrl={info?.publicUrl ?? null} onLeave={leave} />
      ) : (
        <Home
          name={name}
          setName={setName}
          password={password}
          setPassword={setPassword}
          passwordRequired={!!info?.passwordRequired}
          initialCode={codeFromHash()}
          busy={busy}
          onCreate={() => enter('create', '')}
          onJoin={(code) => enter('join', code)}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
