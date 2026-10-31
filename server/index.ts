import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';
import type { ClientToServerEvents, ServerInfo, ServerToClientEvents } from '../shared/types.ts';
import { RoomManager } from './rooms.ts';

const PORT = Number(process.env.PORT ?? 3001);
// 설정하면 방을 만들거나 들어갈 때 이 비밀번호가 필요하다 (친구들끼리만 쓰기 위한 간단한 잠금)
const SITE_PASSWORD = process.env.SITE_PASSWORD || undefined;
// 친구들이 접속할 주소 (예: https://myname.duckdns.org). 설정하면 초대 링크가 이 주소로 만들어진다
const PUBLIC_URL = process.env.PUBLIC_URL?.replace(/\/+$/, '') || null;

const app = express();
const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  maxHttpBufferSize: 1e6,
});

app.get('/api/info', (_req, res) => {
  const info: ServerInfo = { passwordRequired: !!SITE_PASSWORD, publicUrl: PUBLIC_URL };
  res.json(info);
});

const distDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
if (existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get(/^(?!\/socket\.io|\/api).*/, (_req, res) => res.sendFile(path.join(distDir, 'index.html')));
}

const rooms = new RoomManager(io, SITE_PASSWORD);
io.on('connection', (socket) => rooms.attach(socket));

httpServer.listen(PORT, () => {
  console.log(`🎲 PartyGame Table 서버: http://localhost:${PORT}${SITE_PASSWORD ? ' (비밀번호 사용)' : ''}`);
  if (PUBLIC_URL) console.log(`   친구 초대 주소: ${PUBLIC_URL}`);
});
