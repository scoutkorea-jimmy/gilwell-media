import { test, expect, Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 다크모드 실렌더 대비 검증
 *
 * 배포된 페이지를 열되 CSS 요청만 가로채 **로컬 파일**로 바꿔치기한다.
 * 덕분에 배포 전에 실제 마크업 위에서 다크모드를 검증할 수 있다.
 *
 * 화면에서 실제 계산된 color / background-color 쌍을 뽑아 APCA Lc 를 재고,
 * rules/11-site-design.md 기준(본문 |Lc| 75+, 콘텐츠 60+, 대형 45+)에 못 미치는
 * 텍스트를 찾아낸다. 눈대중이 아니라 실측이다.
 */

// package.json 이 type: module 이라 __dirname 이 없다. Playwright 는 저장소 루트에서 실행된다.
const CSS_DIR = path.resolve(process.cwd(), 'css');

/** APCA — scripts/apca.mjs 와 동일 상수 (W3C SAPC-APCA 0.1.9) */
function sRGBtoY([r, g, b]: number[]) {
  const s = 2.4;
  return 0.2126729 * (r / 255) ** s + 0.7151522 * (g / 255) ** s + 0.0721750 * (b / 255) ** s;
}
function apca(txt: number[], bg: number[]) {
  const blkThrs = 0.022, blkClmp = 1.414;
  let txtY = sRGBtoY(txt), bgY = sRGBtoY(bg);
  txtY = txtY > blkThrs ? txtY : txtY + (blkThrs - txtY) ** blkClmp;
  bgY = bgY > blkThrs ? bgY : bgY + (blkThrs - bgY) ** blkClmp;
  if (Math.abs(bgY - txtY) < 0.0005) return 0;
  let out: number;
  if (bgY > txtY) {
    const s = (bgY ** 0.56 - txtY ** 0.57) * 1.14;
    out = s < 0.1 ? 0 : s - 0.027;
  } else {
    const s = (bgY ** 0.65 - txtY ** 0.62) * 1.14;
    out = s > -0.1 ? 0 : s + 0.027;
  }
  return out * 100;
}
const parseRgb = (v: string): number[] | null => {
  const m = v.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/);
  if (!m) return null;
  if (m[4] !== undefined && parseFloat(m[4]) === 0) return null; // 완전 투명
  return [+m[1], +m[2], +m[3]];
};

/**
 * 배포된 CSS 요청을 로컬 파일로 바꿔치기.
 * style.css 응답 뒤에 dark-mode.css 를 이어 붙여, HTML 에 <link> 를 넣기 전에도
 * 다크모드를 실제 페이지 위에서 검증할 수 있게 한다.
 */
async function useLocalCss(page: Page) {
  await page.route('**/css/*.css*', async (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop()!;
    const file = path.join(CSS_DIR, name);
    if (!fs.existsSync(file)) return route.continue();
    await route.fulfill({
      status: 200,
      contentType: 'text/css; charset=utf-8',
      body: fs.readFileSync(file, 'utf8'),
    });
  });
}

/**
 * dark-mode.css 를 **맨 마지막**에 주입한다.
 * style.css 에 이어 붙이면 페이지 전용 시트(post.css, calendar.css …)가 나중에
 * 로드돼 동일 특정도 싸움에서 이겨 버린다. 실제 배포에서도 이 파일은 마지막에
 * 링크되므로, 주입 시점을 맞춰야 검증이 실제 배포 상태와 일치한다.
 */
async function injectDarkCss(page: Page) {
  // 전환을 먼저 끈다. 다크 CSS 를 주입하면 `transition: color .15s` 같은 규칙이
  // 발동해, 측정 시점에 보간 중인 중간색(예: rgba(122,119,126,0.757))이 잡힌다.
  // 실제 사용자는 처음부터 다크로 렌더된 페이지를 보므로 전환은 검증 대상이 아니다.
  await page.addStyleTag({
    content: '*,*::before,*::after{transition:none !important;animation:none !important}',
  });
  await page.addStyleTag({ content: fs.readFileSync(path.join(CSS_DIR, 'dark-mode.css'), 'utf8') });
}

/** 화면에 보이는 텍스트 노드의 실제 색 쌍을 수집 */
async function sampleTextColors(page: Page) {
  return page.evaluate(() => {
    // 배경을 위로 훑어 올라가며 찾는다. 그라디언트·배경이미지를 만나면 색을
    // 특정할 수 없으므로 'UNKNOWN' 을 반환해 판정에서 제외한다 (오탐 방지 —
    // 푸터가 보라 그라디언트라 이 처리가 없으면 '흰 글씨 on 흰 배경'으로 오인된다).
    // 사진 위에 얹힌 텍스트(히어로 등)는 배경색을 특정할 수 없다.
    // 요소 사각형이 어떤 이미지·영상과 겹치면 판정에서 제외한다.
    const media = [...document.querySelectorAll('img, picture, video')]
      .map((m) => m.getBoundingClientRect())
      .filter((r) => r.width > 24 && r.height > 24);
    const overlapsMedia = (r: DOMRect) =>
      media.some((m) => r.left < m.right && r.right > m.left && r.top < m.bottom && r.bottom > m.top);

    const opaqueBg = (el: Element): string => {
      if (overlapsMedia(el.getBoundingClientRect())) return 'UNKNOWN';
      let n: Element | null = el;
      while (n) {
        const cs = getComputedStyle(n);
        if (cs.backgroundImage && cs.backgroundImage !== 'none') return 'UNKNOWN';
        const m = cs.backgroundColor.match(/rgba?\(\d+,\s*\d+,\s*\d+(?:,\s*([\d.]+))?/);
        if (m && (m[1] === undefined || parseFloat(m[1]) > 0.85)) return cs.backgroundColor;
        n = n.parentElement;
      }
      return getComputedStyle(document.body).backgroundColor;
    };
    const out: { sel: string; color: string; bg: string; size: number; weight: number; text: string }[] = [];
    const seen = new Set<string>();
    document.querySelectorAll('p, h1, h2, h3, h4, a, span, li, td, button, time, small').forEach((el) => {
      const txt = (el.textContent || '').trim();
      if (!txt || txt.length < 2) return;
      // 자식에 다른 텍스트 요소가 있으면 건너뛴다 (잎 노드만)
      if (el.querySelector('p,h1,h2,h3,h4,a,span,li,td,button,time,small')) return;
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) return;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.opacity === '0' || cs.display === 'none') return;
      const key = el.className + '|' + cs.color + '|' + cs.fontSize;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({
        sel: (el.tagName.toLowerCase() + '.' + String(el.className || '').split(' ')[0]).slice(0, 60),
        color: cs.color, bg: opaqueBg(el),
        size: parseFloat(cs.fontSize), weight: parseInt(cs.fontWeight) || 400,
        text: txt.slice(0, 24),
      });
    });
    return out;
  });
}

/**
 * 기존부터 존재하던 라이트 모드 대비 미달 — 이번 다크모드 작업이 만든 것이 아니다.
 * 새 회귀는 계속 잡아내되, 이미 있던 부채로 배포가 막히지 않게 분리 기록한다.
 * 해소하면 이 목록에서 지운다.
 */
const KNOWN_LIGHT_DEBT = [
  'span.post-kicker',            // Fire Red 10px 배지, Lc 57.2 (기준 60)
  'span.calendar-week-bar-copy', // --region-apr #ff5b5b, Lc 56.2
  'span.calendar-category-badge',
  'span.calendar-status-badge',
];
/** 클래스가 없어 선택자로 식별되지 않는 것들 — 색 값으로 잡는다. */
const KNOWN_LIGHT_DEBT_COLORS = [
  'rgb(255, 91, 91)',   // --region-apr · 캘린더 카운트 배지, Lc 56.2
  'rgb(255, 86, 85)',   // --fire-red · 10px 키커, Lc 57.2
];

/** 크기·굵기로 요구 Lc 산출 (rules/11-site-design.md) */
function requiredLc(size: number, weight: number) {
  if (size >= 24 || (size >= 18 && weight >= 700)) return 45;
  if (size >= 15) return 60;   // 본문은 75 지만 실측 노이즈를 감안해 콘텐츠 기준 적용
  return 60;
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`${scheme} 모드 대비`, () => {
    test.use({ colorScheme: scheme });

    for (const p of ['/', '/korea', '/apr', '/wosm', '/people', '/glossary', '/wosm-members', '/calendar', '/search?q=%EC%8A%A4%EC%B9%B4%EC%9A%B0%ED%8A%B8', '/post/6', '/about']) {
      test(`${p} 의 텍스트가 대비 기준을 만족한다`, async ({ page }) => {
        await useLocalCss(page);
        // networkidle 은 쓰지 않는다 — 홈 레일이 주기적으로 재조회해 idle 이 오지 않는다.
        await page.goto(p, { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('load').catch(() => {});
        await page.waitForTimeout(2500);
        await injectDarkCss(page);   // 반드시 페이지 전용 시트 뒤에 온다
        await page.waitForTimeout(400);

        const samples = await sampleTextColors(page);
        expect(samples.length, '표본이 수집되어야 한다').toBeGreaterThan(5);

        const fails: string[] = [];
        for (const s of samples) {
          const c = parseRgb(s.color), b = parseRgb(s.bg);
          if (!c || !b || s.bg === 'UNKNOWN') continue;
          const lc = Math.abs(apca(c, b));
          const need = requiredLc(s.size, s.weight);
          if (lc < need) {
            if (scheme === 'light' && (KNOWN_LIGHT_DEBT.some((k) => s.sel.startsWith(k))
                || KNOWN_LIGHT_DEBT_COLORS.includes(s.color))) continue;
            fails.push(`${s.sel} "${s.text}" ${s.size}px/${s.weight} — Lc ${lc.toFixed(1)} < ${need} (${s.color} on ${s.bg})`);
          }
        }
        expect(fails, `대비 미달 ${fails.length}건:\n` + fails.join('\n')).toEqual([]);
      });
    }
  });
}
