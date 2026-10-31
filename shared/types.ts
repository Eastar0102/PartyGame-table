// 서버와 클라이언트가 함께 쓰는 타입과 소켓 이벤트 정의

export interface PlayerInfo {
  id: string;
  name: string;
  connected: boolean;
  isHost: boolean;
}

export interface ChatMessage {
  id: number;
  at: number;
  kind: 'chat' | 'system';
  from?: { id: string; name: string };
  text: string;
}

export interface GameMeta {
  id: string;
  name: string;
  emoji: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  /** 게임 시작 전에 방장이 고르는 옵션 */
  options?: GameOption[];
}

export interface GameOption {
  key: string;
  label: string;
  default: string;
  /** select: 목록에서 고르기, text: 한 줄 입력, textarea: 여러 줄 입력 */
  type?: 'select' | 'text' | 'textarea';
  choices?: { value: string; label: string }[];
  placeholder?: string;
  /** 다른 옵션이 특정 값일 때만 보여준다 */
  showIf?: { key: string; value: string | string[] };
}

export interface RoomState {
  code: string;
  me: string;
  hostId: string;
  players: PlayerInfo[];
  chat: ChatMessage[];
  games: GameMeta[];
  selectedGameId: string;
  /** 진행 중인 게임. 없으면 로비 상태 */
  game: null | {
    id: string;
    playerIds: string[];
    /** 이 플레이어에게 보여지는 게임 상태 (비밀 정보는 서버에서 걸러짐) */
    view: any;
  };
}

export type Ack<T = {}> = (res: ({ ok: true } & T) | { ok: false; error: string }) => void;

export interface ClientToServerEvents {
  'room:create': (p: { token: string; name: string; password?: string }, ack: Ack<{ code: string }>) => void;
  'room:join': (p: { token: string; name: string; code: string; password?: string }, ack: Ack<{ code: string }>) => void;
  'room:leave': () => void;
  'room:kick': (playerId: string) => void;
  'room:transferHost': (playerId: string) => void;
  'chat:send': (text: string) => void;
  'game:select': (gameId: string) => void;
  'game:start': (options: Record<string, unknown>, ack: Ack) => void;
  'game:action': (action: { type: string; [k: string]: unknown }, ack?: Ack) => void;
  'game:end': () => void;
}

export interface ServerToClientEvents {
  'room:state': (state: RoomState) => void;
  'room:kicked': () => void;
  /** 게임별 가벼운 실시간 이벤트 (예: 그림 획) */
  'game:event': (event: { type: string; [k: string]: unknown }) => void;
}

export interface ServerInfo {
  passwordRequired: boolean;
  /** 친구들이 접속할 외부 주소 (설정했을 때만). 초대 링크에 쓰인다 */
  publicUrl: string | null;
}
