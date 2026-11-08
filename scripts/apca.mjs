/**
 * APCA (Accessible Perceptual Contrast Algorithm) — W3C SAPC-APCA 0.1.9 상수.
 *
 * 이 프로젝트의 공식 명암비 알고리즘. WCAG 2.1 의 4.5:1 비율 체계는 쓰지 않는다.
 * 기준은 rules/11-site-design.md:
 *   본문 텍스트(15px+)      |Lc| 75+
 *   콘텐츠 텍스트(14px+ med) |Lc| 60+
 *   대형·헤더(18px bold+)    |Lc| 45+
 *   UI·테두리·아이콘·포커스  |Lc| 30+
 *
 * Lc 는 극성을 가진다. 밝은 배경의 어두운 텍스트는 양수, 어두운 배경의 밝은
 * 텍스트는 음수로 나온다. 판정은 절댓값으로 한다.
 */

export function hexToRgb(hex) {
  let h = String(hex).trim().replace(/^#/, '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length === 8) h = h.slice(0, 6);
  if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new Error(`잘못된 HEX: ${hex}`);
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** sRGB(0-255) → 화면 휘도 Y */
export function sRGBtoY([r, g, b]) {
  const s = 2.4;
  return (
    0.2126729 * Math.pow(r / 255, s) +
    0.7151522 * Math.pow(g / 255, s) +
    0.0721750 * Math.pow(b / 255, s)
  );
}

/** 텍스트색 / 배경색 → Lc (-108 ~ +106) */
export function apcaContrast(txtHex, bgHex) {
  const normBG = 0.56, normTXT = 0.57, revTXT = 0.62, revBG = 0.65;
  const blkThrs = 0.022, blkClmp = 1.414;
  const scale = 1.14, loOffset = 0.027, deltaYmin = 0.0005, loClip = 0.1;

  let txtY = sRGBtoY(hexToRgb(txtHex));
  let bgY = sRGBtoY(hexToRgb(bgHex));

  // 검정 근처 소프트 클램프
  txtY = txtY > blkThrs ? txtY : txtY + Math.pow(blkThrs - txtY, blkClmp);
  bgY = bgY > blkThrs ? bgY : bgY + Math.pow(blkThrs - bgY, blkClmp);

  if (Math.abs(bgY - txtY) < deltaYmin) return 0;

  let out;
  if (bgY > txtY) {
    // 정극성: 밝은 배경 + 어두운 텍스트
    const sapc = (Math.pow(bgY, normBG) - Math.pow(txtY, normTXT)) * scale;
    out = sapc < loClip ? 0 : sapc - loOffset;
  } else {
    // 역극성: 어두운 배경 + 밝은 텍스트
    const sapc = (Math.pow(bgY, revBG) - Math.pow(txtY, revTXT)) * scale;
    out = sapc > -loClip ? 0 : sapc + loOffset;
  }
  return out * 100;
}

/** |Lc| 기준 등급 판정 */
export function apcaVerdict(lc) {
  const a = Math.abs(lc);
  if (a >= 75) return { level: '본문', ok: true };
  if (a >= 60) return { level: '콘텐츠', ok: true };
  if (a >= 45) return { level: '대형·헤더', ok: true };
  if (a >= 30) return { level: 'UI·테두리', ok: true };
  return { level: '부족', ok: false };
}
