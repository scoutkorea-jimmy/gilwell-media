import { test, expect } from '@playwright/test';

// 00.176.02 회귀 가드 — 홈 레일의 태그 칩 영역.
//
// 글마다 태그 개수가 달라 라벨 영역이 1~3행으로 갈렸고, 그 편차가 그대로 카드
// 높이 → 4컬럼 하단 어긋남이 됐다(수정 전 실측: 열별 카드 높이 635·713·713·791px).
// 이제 CSS 가 영역을 2행으로 고정하고, js/home-helpers.js clampMiniLabelRows 가
// 넘치는 칩을 숨긴 뒤 "+N" 칩으로 대체한다.

const VIEWPORTS = [
  { name: '데스크톱', width: 1512, height: 1000 },
  { name: '태블릿', width: 1024, height: 900 },
  { name: '모바일', width: 390, height: 900 },
];

for (const vp of VIEWPORTS) {
  test(`${vp.name}(${vp.width}px): 태그 칩이 라벨 영역을 벗어나지 않는다`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/');
    // 클램프는 레일 렌더 직후에 돈다. /api/home 응답 + 렌더까지 여유를 준다.
    await page.waitForTimeout(4_000);

    const result = await page.evaluate(() => {
      const heights = new Set<number>();
      let overflowBottom = 0;
      let overflowRight = 0;
      let visibleBoxes = 0;

      document.querySelectorAll('.mini-item-labels').forEach((lab) => {
        const box = (lab as HTMLElement).getBoundingClientRect();
        if (box.height === 0) return; // 반응형으로 숨겨진 섹션
        visibleBoxes += 1;
        heights.add(Math.round(box.height));
        lab.querySelectorAll(':scope > *').forEach((child) => {
          const r = (child as HTMLElement).getBoundingClientRect();
          if (r.height === 0) return; // 클램프로 숨긴 칩
          if (r.bottom > box.bottom + 0.5) overflowBottom += 1;
          if (r.right > box.right + 0.5) overflowRight += 1;
        });
      });

      return {
        heights: [...heights],
        overflowBottom,
        overflowRight,
        visibleBoxes,
      };
    });

    expect(result.visibleBoxes, '측정 대상 라벨 영역이 있어야 함').toBeGreaterThan(0);
    // 높이가 하나로 수렴해야 카드·컬럼이 정렬된다.
    expect(result.heights, '라벨 영역 높이는 단일 값이어야 함').toHaveLength(1);
    expect(result.overflowBottom, '아래로 넘친 칩').toBe(0);
    expect(result.overflowRight, '옆으로 넘친 칩').toBe(0);
  });
}

test('4컬럼 레일의 카드 높이가 서로 같다', async ({ page }) => {
  await page.setViewportSize({ width: 1512, height: 1000 });
  await page.goto('/');
  await page.waitForTimeout(4_000);

  const heights = await page.evaluate(() =>
    ['col-korea', 'col-apr', 'col-wosm', 'col-people'].map((id) => {
      const card = document.getElementById(id)?.closest('.home-rail-card') as HTMLElement | null;
      return card ? Math.round(card.getBoundingClientRect().height) : -1;
    })
  );

  expect(heights).not.toContain(-1);
  expect(new Set(heights).size, `열별 카드 높이: ${heights.join(' / ')}`).toBe(1);
});
