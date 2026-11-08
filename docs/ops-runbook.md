---
tags: [ops, runbook, stability]
aliases: [Ops Runbook, 운영 매뉴얼]
---

# Ops Runbook — 외부 서비스/cron 가입 가이드

이 문서는 코드만으로는 완결되지 않는 **외부 서비스 가입·secret 등록·cron 설정**을 한곳에 모은 운영 매뉴얼입니다. 안정성 패키지 1차(2026-05-24)에서 코드가 준비된 항목들의 활성화 단계입니다.

> [!info] 자동/수동 구분
> - **자동 (이미 활성):** drafts TTL cron(publish-due에 piggyback), admin write rate-limit, optimistic locking, self-report 가드, /api/jobs/cleanup-drafts
> - **수동 가입 필요:** high severity 이메일 알림, 외부 uptime 모니터, D1/R2 백업 cron

---

## 1. High severity 이메일 알림 (F2)

`workers/alert-high-severity.js` + `wrangler.alert-high-severity.toml` 준비됨. 활성화하려면:

### 1-A. Cloudflare Email Workers (권장, 무료)

```bash
# 1) Cloudflare 대시보드 → 사용 도메인(bpmedia.net) → Email → Email Routing 활성화
#    수신 도메인을 추가하면 SPF/MX 레코드가 자동 안내됨. DNS에 반영.
# 2) wrangler.alert-high-severity.toml 에 send_email binding 추가:
```

```toml
[[send_email]]
name = "SEND_EMAIL"
destination_address = "<운영자 이메일>"   # 사전에 Email Routing에서 검증한 주소만 가능
```

```bash
# 3) Secret 등록 (운영자 본인 이메일 + 발신 검증 도메인)
wrangler secret put ALERT_TO_EMAIL   --config wrangler.alert-high-severity.toml
wrangler secret put ALERT_FROM_EMAIL --config wrangler.alert-high-severity.toml

# 4) Deploy
wrangler deploy --config wrangler.alert-high-severity.toml
```

### 1-B. Resend (외부, 월 100건 무료)

Email Routing 설정이 부담스러우면:

```bash
# 1) https://resend.com 가입 → 발신 도메인 검증 (DNS TXT)
# 2) API Key 발급
wrangler secret put RESEND_API_KEY    --config wrangler.alert-high-severity.toml
wrangler secret put ALERT_TO_EMAIL    --config wrangler.alert-high-severity.toml
wrangler secret put ALERT_FROM_EMAIL  --config wrangler.alert-high-severity.toml
wrangler deploy --config wrangler.alert-high-severity.toml
```

### 검증
워커 활성 후 다음 명령으로 강제 트리거 가능:
```bash
curl https://gilwell-media-alert-high-severity.<account>.workers.dev
```
또는 가짜 high severity issue를 INSERT(예: 관리자 콘솔에서 직접 등록) 후 5분 대기.

---

## 2. 외부 uptime 모니터 (F5)

Cloudflare 자체 다운이나 region failover 케이스에서 사이트가 실제로 다운된 걸 운영자가 알기 위해 **외부 서비스 1곳에서 5분 간격 ping**.

### 추천: UptimeRobot (무료, 5분 간격, 50 모니터)

1. https://uptimerobot.com 가입
2. Add New Monitor:
   - Monitor Type: HTTP(s)
   - URL: `https://bpmedia.net/api/version`
   - Friendly Name: `BP미디어 site_version`
   - Interval: 5 minutes
   - Keyword (선택): `site_version` (응답 본문에 이 문자열 있어야 정상)
3. Alert Contacts에 운영자 이메일 등록

### 대안: Better Stack / Pingdom / Healthchecks.io

같은 패턴. 무료 tier 모두 5분 간격 지원.

### 모니터링할 엔드포인트

| URL | 검증 |
|---|---|
| `https://bpmedia.net/api/version` | `site_version` 응답 (가장 가벼움) |
| `https://bpmedia.net/` | HTML 200 (실제 사용자 경험) |
| `https://bpmedia.net/rss.xml` | feed reader 다운 감지 |

---

## 3. D1 백업 cron (B1)

`scripts/backup_d1.sh` + `scripts/backup_r2.sh` 준비됨. 로컬에서 수동 실행 가능:

```bash
./scripts/backup_d1.sh        # backups/d1/gilwell-posts-YYYYMMDD-HHMMSS.sql.gz
./scripts/backup_r2.sh        # R2 manifest만
./scripts/backup_r2.sh --full # R2 객체 바이트까지 (큰 용량 주의)
```

### 자동화: macOS launchd (운영자 맥미니 기준)

`~/Library/LaunchAgents/net.bpmedia.backup.plist`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>net.bpmedia.backup</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>-c</string>
    <string>cd /Users/jimmy_macmini/Desktop/VS_Code/gilwell-media &amp;&amp; ./scripts/backup_d1.sh &amp;&amp; ./scripts/backup_r2.sh</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key><integer>4</integer>
    <key>Minute</key><integer>0</integer>
    <key>Weekday</key><integer>1</integer>
  </dict>
  <key>StandardOutPath</key><string>/tmp/bpmedia-backup.log</string>
  <key>StandardErrorPath</key><string>/tmp/bpmedia-backup.log</string>
</dict>
</plist>
```

```bash
launchctl load ~/Library/LaunchAgents/net.bpmedia.backup.plist
```

매주 월요일 04:00 KST 자동 실행. `backups/d1/` 30일 초과 파일은 스크립트가 알아서 정리.

### 대안: GitHub Actions (저장소 자체에 cron)
`.github/workflows/backup.yml` workflow에서 `wrangler d1 export` 후 artifact upload. CF Token이 GitHub Secret에 있어야 함. 저장소 외부 backup 효과.

---

## 4. 활성 cron 워커 목록

| Worker | 트리거 | 역할 |
|---|---|---|
| `gilwell-media-publish-due` | `*/5 * * * *` | scheduled post 게재 + drafts TTL 정리 |
| `gilwell-media-alert-high-severity`(예정) | `*/5 * * * *` | high severity issue 이메일 알림 |

활성/비활성 확인:
```bash
wrangler triggers list --config wrangler.publish-due.toml
wrangler triggers list --config wrangler.alert-high-severity.toml
```

---

## 5. 안정성 점검 일상 체크리스트

주 1회 (월요일 운영자 점검):

- [ ] `./scripts/audit_orphans.sh` 실행 — 고아 row가 0~수 건이면 정상. 100+ 누적이면 cleanup 필요
- [ ] `backups/d1/` 최근 백업 파일 존재 확인 (launchd cron 동작 여부)
- [ ] 관리자 콘솔 → "사이트 오류·이슈 기록"에서 `open` 상태 issue 처리
- [ ] `curl -s https://bpmedia.net/api/version` 응답 200·예상 버전 확인 (외부 monitor가 자동으로 해주지만 수동도 가능)

---

## 6. 재해 복구 시나리오

### A. D1 사고 (DB 손상·실수 DROP)
1. Cloudflare 대시보드 → D1 → gilwell-posts → Restore from time → 사고 직전 시각 선택 (CF 자체 PITR)
2. CF PITR로 안 풀리면 `backups/d1/<latest>.sql.gz`를 사용:
   ```bash
   gunzip -c backups/d1/gilwell-posts-YYYYMMDD.sql.gz | wrangler d1 execute gilwell-posts --remote --file=/dev/stdin
   ```

### B. R2 사고 (이미지 삭제·접근 불가)
1. R2 자체 redundancy로 대부분 자동 복구
2. 영구 손실 시 `backups/r2/<latest>.manifest.json`에서 키 목록 확인 → D1 image_url 대조하여 사용 중 키 추출 → 원본 보유자에게 재업로드 요청

### C. ADMIN_SECRET 유출 의심
1. `wrangler secret put ADMIN_SECRET` 으로 새 값 등록 (자동으로 모든 토큰 무효화)
2. 모든 운영자가 다시 로그인해야 함
3. 사고 시각 이후 `homepage_issues`·`post_history` 검토하여 의심 행위 추적
