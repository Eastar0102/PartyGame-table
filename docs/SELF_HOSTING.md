# 내 컴퓨터로 서버 열기

내 PC에서 서버를 켜고 친구들이 인터넷으로 접속하게 하는 방법입니다. 예시는 Windows 기준입니다.

```
친구 브라우저 ──https──▶ 공유기(80/443 포트포워딩) ──▶ 내 PC: Caddy(HTTPS) ──▶ npm start(3001)
```

필요한 것:

| 문제 | 해결 |
| --- | --- |
| 친구가 내 PC를 찾을 주소 | 무료 도메인 (DuckDNS) |
| 공유기가 외부 접속을 막음 | 포트포워딩 |
| Windows 방화벽이 막음 | 인바운드 규칙 추가 |
| HTTPS | Caddy (인증서 자동 발급·갱신) |
| 아무나 들어오는 문제 | `SITE_PASSWORD` |

HTTPS 없이 `http://`로만 열어도 게임은 동작합니다. 다만 브라우저에 "주의 요함"이 뜨고 비밀번호가 암호화되지 않으니, 가능하면 HTTPS까지 설정하세요.

## 0. 먼저 확인: 포트포워딩이 가능한 회선인가

1. 공유기 관리 페이지(보통 `192.168.0.1` 또는 `192.168.1.1`)에서 **외부(WAN) IP**를 확인합니다.
2. https://ifconfig.me 에 접속해서 나오는 IP와 비교합니다.

두 값이 **같으면** 아래 방법대로 진행하면 됩니다.

두 값이 **다르면** 통신사가 공인 IP를 여러 집이 나눠 쓰게 하는 경우(CGNAT)입니다. 공유기 뒤의 다른 공유기에 연결된 경우도 이렇게 나옵니다. 이때는 포트포워딩으로 열 수 없으니, 맨 아래 "포트포워딩이 안 될 때"를 보세요. 학교나 회사 네트워크도 대부분 여기에 해당합니다.

## 1. 내 PC의 내부 IP 고정

포트포워딩은 "이 내부 IP로 보내라"는 설정이라, PC의 내부 IP가 바뀌면 끊깁니다.

1. PowerShell에서 `ipconfig`를 실행하고 `IPv4 주소`(예: `192.168.0.23`)를 확인합니다.
2. 공유기 관리 페이지의 **DHCP 고정 할당**(제조사에 따라 "IP 예약", "고정 IP 할당")에서 이 PC에 그 IP를 고정합니다.

## 2. 무료 도메인 만들기 (DuckDNS)

집 인터넷의 공인 IP는 가끔 바뀌므로, 바뀌어도 따라가는 도메인을 씁니다.

1. https://www.duckdns.org 에 로그인하고 서브도메인을 만듭니다. 예: `myparty` → `myparty.duckdns.org`
2. 현재 IP가 자동으로 등록됩니다. IP가 바뀔 때를 대비해 DuckDNS의 install 페이지에서 Windows용 자동 갱신 방법을 설정해 두세요.

## 3. 공유기 포트포워딩

공유기 관리 페이지의 **포트포워딩**(제조사에 따라 "NAT 설정", "가상 서버")에서 두 개를 추가합니다.

| 외부 포트 | 내부 IP | 내부 포트 | 프로토콜 |
| --- | --- | --- | --- |
| 80 | 1단계의 IP | 80 | TCP |
| 443 | 1단계의 IP | 443 | TCP |

80번은 HTTPS 인증서를 발급받을 때 필요합니다. 통신사가 80번을 막아 둔 경우가 있는데, 그러면 인증서 발급이 실패합니다. 이때는 "포트포워딩이 안 될 때"를 보세요.

## 4. Windows 방화벽 열기

PowerShell을 **관리자 권한**으로 열고 실행합니다.

```powershell
New-NetFirewallRule -DisplayName "PartyGame Table (HTTP/HTTPS)" -Direction Inbound -Protocol TCP -LocalPort 80,443 -Action Allow
```

나중에 닫으려면:

```powershell
Remove-NetFirewallRule -DisplayName "PartyGame Table (HTTP/HTTPS)"
```

3001번은 열 필요가 없습니다. 외부에서는 Caddy(80/443)로만 들어오고, Caddy가 같은 PC 안에서 3001번으로 넘겨 줍니다.

## 5. Caddy로 HTTPS 붙이기

1. https://caddyserver.com/download 에서 Windows용 `caddy.exe`를 받습니다.
2. 같은 폴더에 `Caddyfile`이라는 파일(확장자 없음)을 만들고 아래처럼 씁니다. 도메인은 2단계에서 만든 것으로 바꿉니다.

```
myparty.duckdns.org {
	reverse_proxy localhost:3001
}
```

3. 그 폴더에서 실행합니다. 처음 실행할 때 인증서를 자동으로 받습니다.

```powershell
.\caddy.exe run
```

Caddy는 웹소켓도 그대로 전달하므로 따로 설정할 것이 없습니다.

## 6. 게임 서버 켜기

다른 PowerShell 창에서 저장소 폴더로 이동해 실행합니다.

```powershell
npm install
npm run build
$env:SITE_PASSWORD="우리끼리비번"; $env:PUBLIC_URL="https://myparty.duckdns.org"; npm start
```

- `PUBLIC_URL`을 설정하면, 방장이 내 PC에서 `localhost`로 접속해도 "초대 링크 복사"가 친구가 열 수 있는 주소로 만들어집니다.
- `SITE_PASSWORD`는 친구들에게 따로 알려 주세요.

## 7. 친구 초대

1. 방을 만들고 **초대 링크 복사**를 누릅니다. 링크는 `https://myparty.duckdns.org/#/ABCD` 형태입니다.
2. 링크와 비밀번호를 카톡 등으로 보냅니다.
3. 친구는 링크를 열고 닉네임과 비밀번호를 넣으면 바로 그 방에 들어옵니다.

**확인 방법:** 휴대폰의 와이파이를 끄고 LTE/5G로 링크를 열어 보세요. 집 와이파이에서는 공유기에 따라 내 도메인으로 접속이 안 되는 경우가 있습니다(헤어핀 NAT 미지원). 그럴 때 내 PC에서는 `http://localhost:3001`로 접속하면 됩니다.

## 포트포워딩이 안 될 때 (CGNAT, 80번 차단 등)

서버는 그대로 내 PC에서 돌리고, 바깥과 연결하는 통로만 터널 서비스에 맡깁니다. 포트포워딩, 방화벽, HTTPS 설정이 모두 필요 없습니다.

**Cloudflare Tunnel** (무료, HTTPS 주소 제공):

```powershell
winget install --id Cloudflare.cloudflared
cloudflared tunnel --url http://localhost:3001
```

출력되는 `https://...trycloudflare.com` 주소를 친구에게 보냅니다. 이 임시 주소는 실행할 때마다 바뀌므로, 서버를 켤 때 `PUBLIC_URL`을 그 주소로 설정하거나 브라우저에서 그 주소로 접속한 뒤 초대 링크를 복사하세요. 고정 주소가 필요하면 Cloudflare 계정과 본인 도메인으로 이름 있는 터널을 만들 수 있습니다.

**playit.gg**도 같은 원리입니다. TCP 터널을 로컬 포트 `3001`로 만들면 됩니다.

## 보안 주의

- 서버를 여는 동안 내 PC의 80/443 포트가 인터넷에 노출됩니다. 쓰지 않을 때는 Caddy와 서버를 꺼 두세요.
- `SITE_PASSWORD`는 꼭 설정하세요. 설정하지 않으면 주소를 아는 누구나 방을 만들 수 있습니다.
- 3001번 포트는 포트포워딩하거나 방화벽에서 열지 마세요. Caddy를 거치지 않는 HTTP 통로가 생깁니다.
