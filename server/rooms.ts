import { createHash, randomInt } from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import type { ChatMessage, ClientToServerEvents, RoomState, ServerToClientEvents } from '../shared/types.ts';
import { GAMES, GAME_LIST } from './games/index.ts';
import type { GameContext, GameModule, GamePlayer } from './games/types.ts';

type IO = Server<ClientToServerEvents, ServerToClientEvents>;
type Sock = Socket<ClientToServerEvents, ServerToClientEvents>;

interface Player {
  id: string;
  name: string;
  socketId: string | null;
  disconnectedAt: number | null;
}

interface ActiveGame {
  module: GameModule;
  state: unknown;
  players: GamePlayer[];
}

interface Room {
  code: string;
  hostId: string;
  players: Player[];
  chat: ChatMessage[];
  selectedGameId: string;
  game: ActiveGame | null;
  emptySince: number | null;
}

const MAX_PLAYERS_PER_ROOM = 20;
const CHAT_LIMIT = 200;
const ROOM_IDLE_MS = 30 * 60 * 1000;
const HOST_HANDOFF_MS = 60 * 1000;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** 비밀 토큰에서 공개용 id를 만든다. 다른 사람의 id를 알아도 그 사람으로 위장할 수 없다. */
export function publicIdFromToken(token: string): string {
  return createHash('sha256').update(token).digest('hex').slice(0, 12);
}

function cleanName(name: unknown): string | null {
  if (typeof name !== 'string') return null;
  const n = name.trim().slice(0, 16);
  return n.length > 0 ? n : null;
}

export class RoomManager {
  private rooms = new Map<string, Room>();
  private socketRoom = new Map<string, { code: string; playerId: string }>();
  private chatSeq = 0;

  constructor(
    private io: IO,
    private sitePassword: string | undefined,
  ) {
    setInterval(() => this.tick(), 1000);
  }

  attach(socket: Sock) {
    socket.on('room:create', (p, ack) => {
      if (!this.checkPassword(p.password)) return ack({ ok: false, error: '비밀번호가 맞지 않습니다.' });
      const name = cleanName(p.name);
      if (!name || typeof p.token !== 'string' || p.token.length < 16) return ack({ ok: false, error: '닉네임을 입력해 주세요.' });
      const code = this.newCode();
      const room: Room = {
        code,
        hostId: publicIdFromToken(p.token),
        players: [],
        chat: [],
        selectedGameId: GAME_LIST[0].meta.id,
        game: null,
        emptySince: null,
      };
      this.rooms.set(code, room);
      this.join(socket, room, p.token, name);
      ack({ ok: true, code });
    });

    socket.on('room:join', (p, ack) => {
      if (!this.checkPassword(p.password)) return ack({ ok: false, error: '비밀번호가 맞지 않습니다.' });
      const name = cleanName(p.name);
      if (!name || typeof p.token !== 'string' || p.token.length < 16) return ack({ ok: false, error: '닉네임을 입력해 주세요.' });
      const room = this.rooms.get(String(p.code ?? '').toUpperCase().trim());
      if (!room) return ack({ ok: false, error: '방을 찾을 수 없습니다. 코드를 확인해 주세요.' });
      const id = publicIdFromToken(p.token);
      if (!room.players.some((pl) => pl.id === id) && room.players.length >= MAX_PLAYERS_PER_ROOM) {
        return ack({ ok: false, error: `방이 가득 찼습니다. (최대 ${MAX_PLAYERS_PER_ROOM}명)` });
      }
      this.join(socket, room, p.token, name);
      ack({ ok: true, code: room.code });
    });

    socket.on('room:leave', () => {
      const ctx = this.lookup(socket);
      if (ctx) this.removePlayer(ctx.room, ctx.playerId, 'left');
    });

    socket.on('room:kick', (targetId) => {
      const ctx = this.lookup(socket);
      if (!ctx || ctx.room.hostId !== ctx.playerId || targetId === ctx.playerId) return;
      const target = ctx.room.players.find((p) => p.id === targetId);
      if (!target) return;
      if (target.socketId) {
        this.io.to(target.socketId).emit('room:kicked');
        this.io.sockets.sockets.get(target.socketId)?.leave(ctx.room.code);
        this.socketRoom.delete(target.socketId);
      }
      this.removePlayer(ctx.room, targetId, 'kicked');
    });

    socket.on('room:transferHost', (targetId) => {
      const ctx = this.lookup(socket);
      if (!ctx || ctx.room.hostId !== ctx.playerId) return;
      const target = ctx.room.players.find((p) => p.id === targetId);
      if (!target) return;
      ctx.room.hostId = target.id;
      this.system(ctx.room, `${target.name}님이 방장이 되었습니다.`);
      this.sync(ctx.room);
    });

    socket.on('chat:send', (text) => {
      const ctx = this.lookup(socket);
      if (!ctx || typeof text !== 'string') return;
      const t = text.trim().slice(0, 500);
      if (!t) return;
      const player = ctx.room.players.find((p) => p.id === ctx.playerId)!;
      this.pushChat(ctx.room, { kind: 'chat', from: { id: player.id, name: player.name }, text: t });
      this.sync(ctx.room);
    });

    socket.on('game:select', (gameId) => {
      const ctx = this.lookup(socket);
      if (!ctx || ctx.room.hostId !== ctx.playerId || ctx.room.game || !GAMES[gameId]) return;
      ctx.room.selectedGameId = gameId;
      this.sync(ctx.room);
    });

    socket.on('game:start', (options, ack) => {
      const ctx = this.lookup(socket);
      if (!ctx) return ack({ ok: false, error: '방에 들어가 있지 않습니다.' });
      const { room } = ctx;
      if (room.hostId !== ctx.playerId) return ack({ ok: false, error: '방장만 게임을 시작할 수 있습니다.' });
      if (room.game) return ack({ ok: false, error: '이미 게임이 진행 중입니다.' });
      const module = GAMES[room.selectedGameId];
      const present = room.players.filter((p) => p.socketId);
      const { minPlayers, maxPlayers } = module.meta;
      if (present.length < minPlayers) return ack({ ok: false, error: `${module.meta.name}은(는) 최소 ${minPlayers}명이 필요합니다.` });
      // 인원이 넘치면 먼저 들어온 순서대로 참가하고 나머지는 관전
      const players = present.slice(0, maxPlayers).map((p) => ({ id: p.id, name: p.name }));
      const game: ActiveGame = { module, state: null, players };
      try {
        game.state = module.setup(this.context(room, game), options && typeof options === 'object' ? options : {});
      } catch (e) {
        return ack({ ok: false, error: e instanceof Error ? e.message : '게임을 시작할 수 없습니다.' });
      }
      room.game = game;
      const spectators = present.length - players.length;
      this.system(room, `🎮 ${module.meta.name} 시작! (참가 ${players.length}명${spectators > 0 ? `, 관전 ${spectators}명` : ''})`);
      ack({ ok: true });
      this.sync(room);
    });

    socket.on('game:action', (action, ack) => {
      const ctx = this.lookup(socket);
      const reply = typeof ack === 'function' ? ack : () => {};
      if (!ctx || !ctx.room.game) return reply({ ok: false, error: '진행 중인 게임이 없습니다.' });
      if (!action || typeof action.type !== 'string') return reply({ ok: false, error: '잘못된 요청입니다.' });
      const { room } = ctx;
      const game = room.game!;
      let skip = false;
      const gctx = this.context(room, game, () => (skip = true));
      let err: string | void;
      try {
        err = game.module.action(game.state, ctx.playerId, action, gctx);
      } catch (e) {
        console.error('game action failed', e);
        err = '처리 중 오류가 발생했습니다.';
      }
      if (err) return reply({ ok: false, error: err });
      reply({ ok: true });
      if (!skip) this.sync(room);
    });

    socket.on('game:end', () => {
      const ctx = this.lookup(socket);
      if (!ctx || ctx.room.hostId !== ctx.playerId || !ctx.room.game) return;
      this.system(ctx.room, `${ctx.room.game.module.meta.name}을(를) 마치고 로비로 돌아갑니다.`);
      ctx.room.game = null;
      this.sync(ctx.room);
    });

    socket.on('disconnect', (reason, description) => {
      if (process.env.DEBUG_SOCKETS) console.log(new Date().toISOString(), 'disconnect', socket.id, reason, description instanceof Error ? description.message : (description ?? ''));
      const ctx = this.lookup(socket);
      this.socketRoom.delete(socket.id);
      if (!ctx) return;
      const player = ctx.room.players.find((p) => p.id === ctx.playerId);
      if (player && player.socketId === socket.id) {
        player.socketId = null;
        player.disconnectedAt = Date.now();
        this.sync(ctx.room);
      }
    });
  }

  private checkPassword(pw: unknown): boolean {
    return !this.sitePassword || pw === this.sitePassword;
  }

  private newCode(): string {
    for (;;) {
      let code = '';
      for (let i = 0; i < 4; i++) code += CODE_CHARS[randomInt(CODE_CHARS.length)];
      if (!this.rooms.has(code)) return code;
    }
  }

  private lookup(socket: Sock): { room: Room; playerId: string } | null {
    const entry = this.socketRoom.get(socket.id);
    if (!entry) return null;
    const room = this.rooms.get(entry.code);
    if (!room || !room.players.some((p) => p.id === entry.playerId)) return null;
    return { room, playerId: entry.playerId };
  }

  private join(socket: Sock, room: Room, token: string, name: string) {
    // 다른 방에 있었다면 먼저 정리
    const prev = this.socketRoom.get(socket.id);
    if (prev && prev.code !== room.code) {
      const prevRoom = this.rooms.get(prev.code);
      socket.leave(prev.code);
      if (prevRoom) this.removePlayer(prevRoom, prev.playerId, 'left');
    }
    const id = publicIdFromToken(token);
    let player = room.players.find((p) => p.id === id);
    if (player) {
      // 재접속: 이전 소켓이 남아 있으면 끊는다 (같은 사람이 탭을 두 개 연 경우)
      if (player.socketId && player.socketId !== socket.id) {
        const old = this.io.sockets.sockets.get(player.socketId);
        this.socketRoom.delete(player.socketId);
        old?.leave(room.code);
        old?.emit('room:kicked');
      }
      const wasAway = !player.socketId;
      player.socketId = socket.id;
      player.disconnectedAt = null;
      player.name = name;
      if (wasAway) this.system(room, `${name}님이 다시 접속했습니다.`);
    } else {
      player = { id, name, socketId: socket.id, disconnectedAt: null };
      room.players.push(player);
      this.system(room, `${name}님이 들어왔습니다.`);
    }
    room.emptySince = null;
    socket.join(room.code);
    this.socketRoom.set(socket.id, { code: room.code, playerId: id });
    this.sync(room);
  }

  private removePlayer(room: Room, playerId: string, reason: 'left' | 'kicked') {
    const idx = room.players.findIndex((p) => p.id === playerId);
    if (idx < 0) return;
    const [player] = room.players.splice(idx, 1);
    if (player.socketId) {
      this.io.sockets.sockets.get(player.socketId)?.leave(room.code);
      this.socketRoom.delete(player.socketId);
    }
    this.system(room, reason === 'kicked' ? `${player.name}님이 강퇴되었습니다.` : `${player.name}님이 나갔습니다.`);
    if (room.game?.players.some((p) => p.id === playerId)) {
      try {
        room.game.module.onLeave?.(room.game.state, playerId, this.context(room, room.game));
      } catch (e) {
        console.error('onLeave failed', e);
      }
    }
    if (room.players.length === 0) {
      this.rooms.delete(room.code);
      return;
    }
    if (room.hostId === playerId) this.handOffHost(room);
    this.sync(room);
  }

  private handOffHost(room: Room) {
    const next = room.players.find((p) => p.socketId) ?? room.players[0];
    if (!next) return;
    room.hostId = next.id;
    this.system(room, `${next.name}님이 방장이 되었습니다.`);
  }

  private context(room: Room, game: ActiveGame, onSkip: () => void = () => {}): GameContext {
    return {
      players: game.players,
      roomPlayers: room.players.map((p) => ({ id: p.id, name: p.name })),
      hostId: room.hostId,
      now: Date.now(),
      random: Math.random,
      announce: (text) => this.system(room, text),
      emit: (event) => this.io.to(room.code).emit('game:event', event),
      skipSync: onSkip,
    };
  }

  private pushChat(room: Room, msg: Omit<ChatMessage, 'id' | 'at'>) {
    room.chat.push({ ...msg, id: ++this.chatSeq, at: Date.now() });
    if (room.chat.length > CHAT_LIMIT) room.chat.splice(0, room.chat.length - CHAT_LIMIT);
  }

  private system(room: Room, text: string) {
    this.pushChat(room, { kind: 'system', text });
  }

  private sync(room: Room) {
    const base = {
      code: room.code,
      hostId: room.hostId,
      players: room.players.map((p) => ({ id: p.id, name: p.name, connected: !!p.socketId, isHost: p.id === room.hostId })),
      chat: room.chat,
      games: GAME_LIST.map((g) => g.meta),
      selectedGameId: room.selectedGameId,
    };
    const gctx = room.game ? this.context(room, room.game) : null;
    for (const p of room.players) {
      if (!p.socketId) continue;
      let game: RoomState['game'] = null;
      if (room.game && gctx) {
        let view: unknown = null;
        try {
          view = room.game.module.view(room.game.state, p.id, gctx);
        } catch (e) {
          console.error('view failed', e);
        }
        game = { id: room.game.module.meta.id, playerIds: room.game.players.map((x) => x.id), view };
      }
      this.io.to(p.socketId).emit('room:state', { ...base, me: p.id, game });
    }
  }

  private tick() {
    const now = Date.now();
    for (const room of [...this.rooms.values()]) {
      const anyone = room.players.some((p) => p.socketId);
      if (!anyone) {
        room.emptySince ??= now;
        if (now - room.emptySince > ROOM_IDLE_MS) this.rooms.delete(room.code);
        continue;
      }
      let changed = false;
      const host = room.players.find((p) => p.id === room.hostId);
      if (host && !host.socketId && host.disconnectedAt && now - host.disconnectedAt > HOST_HANDOFF_MS) {
        this.handOffHost(room);
        changed = true;
      }
      if (room.game?.module.tick) {
        try {
          if (room.game.module.tick(room.game.state, this.context(room, room.game))) changed = true;
        } catch (e) {
          console.error('tick failed', e);
        }
      }
      if (changed) this.sync(room);
    }
  }
}
