/**
 * Gilwell Media · High severity homepage_issues alert
 *
 * 5분 간격 cron으로 D1 homepage_issues에 새 high/critical 이슈가 등록됐는지
 * 확인. 직전 발사 이후 신규 row가 있으면 운영자 이메일로 알림 발송.
 *
 * 의존:
 *   - Cloudflare Workers Email (Email Routing 설정 필요 — wrangler.toml에
 *     [send_email] binding 등록 + DNS의 SPF/DKIM/DMARC).
 *   - 또는 외부 SMTP (Resend, SendGrid 등) HTTP API — Email Workers 미사용 시.
 *
 * 환경변수:
 *   ALERT_TO_EMAIL      수신자 (콤마 구분 다중 가능)
 *   ALERT_FROM_EMAIL    발신자 (Email Routing 검증 도메인)
 *   ALERT_FROM_NAME     발신 표시 이름 (기본: "BP미디어 운영")
 *   SITE_ORIGIN         링크 base URL
 *
 * Cloudflare Email Workers를 사용하지 않는 환경에서는 sendViaResend()
 * 함수처럼 외부 API로 교체. RESEND_API_KEY secret만 set하면 동작.
 */

export default {
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(runAlertCheck(env));
  },

  async fetch(_request, env) {
    const result = await runAlertCheck(env);
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  },
};

async function runAlertCheck(env) {
  // 직전 발사 시각 기록은 settings 테이블에. 첫 실행이면 1시간 이전부터.
  const lastRow = await env.DB.prepare(
    "SELECT value FROM settings WHERE key = 'alert_high_severity_last_run'"
  ).first();
  const lastRunIso = (lastRow && lastRow.value) || new Date(Date.now() - 3600 * 1000).toISOString();

  const { results } = await env.DB.prepare(
    `SELECT id, title, severity, status, summary, occurrence_count, created_at, last_seen_at
       FROM homepage_issues
      WHERE severity IN ('high', 'critical')
        AND status IN ('open', 'monitoring')
        AND datetime(COALESCE(last_seen_at, created_at)) > datetime(?)
      ORDER BY datetime(COALESCE(last_seen_at, created_at)) DESC
      LIMIT 50`
  ).bind(lastRunIso).all();

  const issues = results || [];
  const nowIso = new Date().toISOString();

  await env.DB.prepare(
    "INSERT INTO settings (key, value) VALUES ('alert_high_severity_last_run', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).bind(nowIso).run();

  if (!issues.length) {
    return { success: true, sent: false, reason: 'no_new_issues', since: lastRunIso };
  }

  const to = String(env.ALERT_TO_EMAIL || '').trim();
  if (!to) {
    return { success: false, sent: false, reason: 'ALERT_TO_EMAIL env var missing', count: issues.length };
  }

  const origin = String(env.SITE_ORIGIN || 'https://bpmedia.net').replace(/\/+$/, '');
  const subject = `[BP미디어] high severity 이슈 ${issues.length}건 (${nowIso.slice(0, 10)})`;
  const body = buildAlertBody(issues, origin);

  // Cloudflare Email Routing이 set up되어 있으면 sendViaCfEmail. 아니면 Resend HTTP API.
  if (env.SEND_EMAIL && typeof env.SEND_EMAIL.send === 'function') {
    await sendViaCfEmail(env, to, subject, body);
  } else if (env.RESEND_API_KEY) {
    await sendViaResend(env, to, subject, body);
  } else {
    return { success: false, sent: false, reason: 'no email transport (SEND_EMAIL binding or RESEND_API_KEY required)', count: issues.length };
  }

  return { success: true, sent: true, count: issues.length, to: to.split(',').length };
}

function buildAlertBody(issues, origin) {
  const lines = [
    '아래 high/critical severity 이슈가 새로 발생했습니다.',
    '',
    `대시보드: ${origin}/admin (사이트 오류·이슈 기록 메뉴)`,
    '',
    '─────────────────────────────────────────────',
  ];
  for (const issue of issues) {
    lines.push(`#${issue.id} · ${issue.severity.toUpperCase()} · ${issue.status}`);
    lines.push(`제목: ${issue.title || '(제목 없음)'}`);
    if (issue.summary) lines.push(`요약: ${issue.summary}`);
    lines.push(`발생: ${issue.last_seen_at || issue.created_at} UTC · 누적 ${issue.occurrence_count}회`);
    lines.push('─────────────────────────────────────────────');
  }
  lines.push('');
  lines.push('이 알림은 5분 간격 cron이 자동 발송합니다. 발송 중단은 worker를 disable하세요.');
  return lines.join('\n');
}

// ─── Email transports ───────────────────────────────────

async function sendViaCfEmail(env, toRaw, subject, body) {
  // Cloudflare Email Workers binding (send_email). MIME 메시지를 직접 만들어 send.
  // 참고: https://developers.cloudflare.com/email-routing/email-workers/send-email-workers/
  const { EmailMessage } = await import('cloudflare:email');
  const fromEmail = String(env.ALERT_FROM_EMAIL || '').trim();
  const fromName = String(env.ALERT_FROM_NAME || 'BP미디어 운영');
  if (!fromEmail) throw new Error('ALERT_FROM_EMAIL env var required');

  for (const to of toRaw.split(',').map((s) => s.trim()).filter(Boolean)) {
    const raw = [
      `From: "${fromName}" <${fromEmail}>`,
      `To: ${to}`,
      `Subject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8',
      '',
      body,
    ].join('\r\n');
    const msg = new EmailMessage(fromEmail, to, raw);
    await env.SEND_EMAIL.send(msg);
  }
}

async function sendViaResend(env, toRaw, subject, body) {
  const fromEmail = String(env.ALERT_FROM_EMAIL || '').trim();
  const fromName = String(env.ALERT_FROM_NAME || 'BP미디어 운영');
  if (!fromEmail) throw new Error('ALERT_FROM_EMAIL env var required');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `${fromName} <${fromEmail}>`,
      to: toRaw.split(',').map((s) => s.trim()).filter(Boolean),
      subject,
      text: body,
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Resend API failed: ${response.status} ${detail.slice(0, 200)}`);
  }
}
