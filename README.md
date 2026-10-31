# 🎲 PartyGame Table

친구들끼리 방을 만들어 TRPG, 보드게임, 파티게임을 함께 즐기는 실시간 웹 게임 테이블입니다.
회원가입 없이 닉네임만 정하고, 방 코드나 초대 링크로 들어오면 됩니다.

## 들어 있는 게임

| 게임 | 인원 | 설명 |
| --- | --- | --- |
| 🎲 TRPG 테이블 | 1~20 | 주사위(`2d6+3`, `4d6kh3`, `d20-1`), GM 비밀 굴림, 캐릭터 시트(HP·메모), 공용 메모와 GM 전용 메모 |
| ⚫ 오목 | 2 (나머지는 관전) | 15×15, 다섯 개 이상 이으면 승리. 흑백 바꿔 재대결 |
| 🤥 라이어 게임 | 3~15 | 한 명만 제시어를 모름. 돌아가며 설명 → 투표 → 지목된 라이어의 정답 기회 |
| 🕵️ 마피아 | 4~15 | 마피아·경찰·의사·시민. 서버가 사회자 역할. 마피아 전용 비밀 대화 |
| 🎨 그림 맞추기 | 2~15 | 한 명이 그리고 나머지가 맞힘. 실시간 캔버스, 빨리 맞힐수록 높은 점수 |
| 🔤 끝말잇기 | 2~15 | 제한 시간 안에 이어 말하기. 두음법칙 허용, 시간 초과 시 탈락 |

인원이 게임 최대 인원보다 많으면 먼저 들어온 순서대로 참가하고 나머지는 관전합니다.

## 실행하기

Node.js 20 이상이 필요합니다.

```bash
npm install
```

개발 모드 (서버 3001번, 화면 5173번 포트. 코드를 고치면 자동 반영):

```bash
npm run dev
```

브라우저에서 http://localhost:5173 을 엽니다. 같은 브라우저의 다른 창은 같은 사람으로 인식되니, 혼자 여러 명을 테스트하려면 시크릿 창이나 다른 브라우저를 쓰세요.

배포용 실행 (빌드 후 서버 하나가 화면까지 함께 제공):

```bash
npm run build && npm start
```

테스트와 타입 검사:

```bash
npm test && npm run typecheck
```

## 친구들끼리만 쓰기 (비밀번호)

환경 변수 `SITE_PASSWORD`를 설정하면 방을 만들거나 들어갈 때 비밀번호를 물어봅니다.

```bash
SITE_PASSWORD=우리끼리 npm start
```

## 배포하기

서버가 계속 떠 있어야 하므로 Render, Railway, Fly.io 같은 Node 호스팅을 씁니다. WebSocket을 지원하는 곳이면 됩니다.

- Build command: `npm install && npm run build`
- Start command: `npm start`
- 환경 변수: `PORT`(보통 호스팅이 자동 지정), `SITE_PASSWORD`(선택)

방과 게임 상태는 서버 메모리에만 있어서, 서버가 재시작되면 진행 중이던 방은 사라집니다.

## 구조

```
shared/types.ts        서버와 화면이 함께 쓰는 타입, 소켓 이벤트
server/index.ts        Express + Socket.IO 서버
server/rooms.ts        방 만들기/입장/재접속, 방장, 채팅, 게임 진행
server/games/*.ts      게임별 규칙 (서버가 판정하고, 사람마다 보이는 정보를 걸러냄)
src/                   React 화면
src/games/*.tsx        게임별 화면
```

### 새 게임 추가하기

1. `server/games/새게임.ts`에 `GameModule`을 구현합니다 (`setup`, `action`, `view`, 필요하면 `tick`, `onLeave`).
   - `view`에서 플레이어마다 보여줄 정보만 돌려주세요. 비밀 정보는 여기서 걸러집니다.
2. `server/games/index.ts`의 `GAME_LIST`에 등록합니다.
3. `src/games/새게임.tsx`에 화면을 만들고 `src/games/index.tsx`의 `GAME_UI`에 등록합니다. 시작 옵션이 있으면 `options`도 적어 주세요.
