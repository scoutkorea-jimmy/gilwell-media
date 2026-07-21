import { test, expect } from '@playwright/test';

/**
 * 누적 레이아웃 이동(CLS) 회귀 가드
 *
 * 2026-07-21 실측: 데스크톱 CLS 0.217 (Google 기준 '개선 필요' 구간).
 * 원인은 티커가 초기에 비어 있다가 문구가 채워지며 16px → 27px 로 커지고,
 * 그 11px 이 아래 전체(히어로 포함)를 밀어낸 것. 최종 높이를 min-height 로
 * 예약해 0.021 로 낮췄다.
 *
 * 같은 유형의 회귀는 "나중에 채워지는 영역에 높이를 예약하지 않는" 순간
 * 언제든 재발한다. 임계값은 Google 의 '양호' 기준 0.1 을 쓴다.
 */

const CLS_GOOD = 0.1;

for (const vp of [
  { width: 390, height: 844, label: '모바일 390px' },
  { width: 1440, height: 900, label: '데스크톱 1440px' },
]) {
  test(`${vp.label} 홈의 CLS 가 ${CLS_GOOD} 이하다`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.addInitScript(() => {
      (window as any).__shifts = [];
      new PerformanceObserver((list) => {
        for (const e of list.getEntries() as any[]) {
          if (!e.hadRecentInput) {
            (window as any).__shifts.push({
              value: e.value,
              sources: (e.sources || []).map((s: any) => s.node?.className || s.node?.tagName || '?').slice(0, 3),
            });
          }
        }
      }).observe({ type: 'layout-shift', buffered: true });
    });

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);   // 티커·레일·히어로가 모두 채워질 때까지

    const r = await page.evaluate(() => {
      const s = (window as any).__shifts as any[];
      return {
        total: s.reduce((a, b) => a + b.value, 0),
        worst: s.sort((a, b) => b.value - a.value).slice(0, 3)
          .map((x) => `${x.value.toFixed(4)} ← ${x.sources.join(' | ')}`),
      };
    });

    expect(
      r.total,
      `CLS ${r.total.toFixed(4)} — 나중에 채워지는 영역에 높이 예약이 빠졌을 수 있습니다.\n` +
      `가장 큰 이동:\n  ${r.worst.join('\n  ')}`
    ).toBeLessThanOrEqual(CLS_GOOD);
  });
}
