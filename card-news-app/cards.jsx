/* cards.jsx — BP Media card-news components (KMS-compliant)
   ─ All colors via var(--color-*) — no literal HEX outside SVG presentation
     attributes (§9 brand-palette SVG exception).
   ─ Spacing via --gap-* and --pad-page-* tokens.
   ─ Fire Red & Ocean Blue used only ≥18px bold (heading/button/icon/border).
   ─ Pastels never as text; pastel bg → Midnight or Black text only.            */

const { useState, useRef, useEffect } = React;

/* ─────────────────────────── BP wordmark / icon ─────────────────────────── */
function BPLogo({ size = 28, mono = false, color = 'var(--color-ink)' }) {
  /* `size` may be a number (px) or a CSS string (em, var). */
  const dim = typeof size === 'number' ? size : undefined;
  const cssSize = typeof size === 'string' ? { width: size, height: size } : undefined;
  /* §9 SVG-presentation exception: brand palette hex is permitted here.
     Tokens referenced for clarity:
       #4D006E = --color-midnight
       #FF5655 = --color-fire
       #0094B4 = --color-ocean                                                 */
  if (mono) {
    return (
      <svg width={dim} height={dim} viewBox="0 0 250 250" aria-label="BP미디어" style={{ color, ...cssSize }}>
        <g fill="currentColor">
          <path d="m124.8 59h-0.17c-8.41-0.02-14.62 1.77-20.82 6.12l-32.33 21.87c-7.03 4.62-10.14 10.33-10.97 19.12l-1.69 16.75c-29.52 5.98-52.6 16.05-52.79 31.12-0.16 17.1 32.92 35.29 116.1 35.83 71.86 0 121.3-15.65 121.5-35.19 0.15-14.14-21.25-23.9-52.81-31.37l-2.33-18.89c-0.93-7.67-4.51-13.81-11.45-18.1l-30.55-21.02c-6.53-4.61-12.61-6.24-21.65-6.24zm-0.1 6.24c7.82 0.02 12.44 1.79 18.12 5.85l30.43 20.89c5.89 3.65 8.96 8.14 9.74 14.66l5.46 46.17c0.23 2.12 2.12 3.48 4.11 2.73 1.34-0.55 1.46-2.19 1.26-4.18l-1.7-21.37c25.22 6 45.52 15.25 45.41 23.99-0.16 13.3-37.46 29.93-115.4 29.93-73.97 0-110-16.98-110-29.79 0-8.41 16.42-17.14 45.9-24.13l-2.66 20.98c-0.23 2.31-0.22 3.96 2.06 4.65 1.83 0.61 3.59-0.61 3.9-2.69l5.53-47.86c0.82-6.14 3.67-10.39 9.56-14.12l31.24-20.89c5.39-3.29 10.15-4.84 17.05-4.82z"/>
          <path d="m114.3 67.06c-1.97 0.57-3.61 1.2-5.17 2.05 2.3 5.88 1.01 13.76-4.33 21.59-6.58 9.64-15 13.66-22.58 13.66-3.89 0-3.89 6.33 0 6.33 11.05 0 21.7-6.72 27.81-15.93 5.46-8.13 7.55-19.12 4.27-27.7z"/>
          <path d="m136.5 66.61c-6.37 4.33-4.8 17.32 2.42 28.47 6.58 9.64 17.63 15.24 28.38 15.61 3.89 0.14 3.73-5.97 0-5.97-9.38 0-17.98-5.6-23.44-14.39-4.73-7.4-6.04-15.26-3.24-20.27-1.25-1.37-2.63-2.5-4.12-3.45z"/>
          <path d="m64.29 127.8-0.81 7.1c19.48 5.9 36.44 8.62 60.88 8.62 21.71 0 39.43-3.22 61.53-8.62l-0.68-7.1c-19.2 6.34-34.9 9.65-60.92 9.65-23.27 0-38.28-2.65-60-9.65z"/>
          <path d="m61.81 149-1.19 6.56c17.17 6.47 37.57 10.24 63.2 10.24 23.95 0 45.09-3.67 66.16-10.31l-2.66-6.46c-19.48 6.7-37.16 10.43-63.18 10.43-23.43 0-42.01-3.73-62.33-10.46z"/>
        </g>
      </svg>
    );
  }
  return (
    <svg width={dim} height={dim} viewBox="0 0 250 250" aria-label="BP미디어" style={cssSize}>
      <path d="m124.8 59h-0.17c-8.41-0.02-14.62 1.77-20.82 6.12l-32.33 21.87c-7.03 4.62-10.14 10.33-10.97 19.12l-1.69 16.75c-29.52 5.98-52.6 16.05-52.79 31.12-0.16 17.1 32.92 35.29 116.1 35.83 71.86 0 121.3-15.65 121.5-35.19 0.15-14.14-21.25-23.9-52.81-31.37l-2.33-18.89c-0.93-7.67-4.51-13.81-11.45-18.1l-30.55-21.02c-6.53-4.61-12.61-6.24-21.65-6.24zm-0.1 6.24c7.82 0.02 12.44 1.79 18.12 5.85l30.43 20.89c5.89 3.65 8.96 8.14 9.74 14.66l5.46 46.17c0.23 2.12 2.12 3.48 4.11 2.73 1.34-0.55 1.46-2.19 1.26-4.18l-1.7-21.37c25.22 6 45.52 15.25 45.41 23.99-0.16 13.3-37.46 29.93-115.4 29.93-73.97 0-110-16.98-110-29.79 0-8.41 16.42-17.14 45.9-24.13l-2.66 20.98c-0.23 2.31-0.22 3.96 2.06 4.65 1.83 0.61 3.59-0.61 3.9-2.69l5.53-47.86c0.82-6.14 3.67-10.39 9.56-14.12l31.24-20.89c5.39-3.29 10.15-4.84 17.05-4.82z" fill="#4D006E"/>
      <path d="m114.3 67.06c-1.97 0.57-3.61 1.2-5.17 2.05 2.3 5.88 1.01 13.76-4.33 21.59-6.58 9.64-15 13.66-22.58 13.66-3.89 0-3.89 6.33 0 6.33 11.05 0 21.7-6.72 27.81-15.93 5.46-8.13 7.55-19.12 4.27-27.7z" fill="#FF5655"/>
      <path d="m136.5 66.61c-6.37 4.33-4.8 17.32 2.42 28.47 6.58 9.64 17.63 15.24 28.38 15.61 3.89 0.14 3.73-5.97 0-5.97-9.38 0-17.98-5.6-23.44-14.39-4.73-7.4-6.04-15.26-3.24-20.27-1.25-1.37-2.63-2.5-4.12-3.45z" fill="#FF5655"/>
      <path d="m64.29 127.8-0.81 7.1c19.48 5.9 36.44 8.62 60.88 8.62 21.71 0 39.43-3.22 61.53-8.62l-0.68-7.1c-19.2 6.34-34.9 9.65-60.92 9.65-23.27 0-38.28-2.65-60-9.65z" fill="#0094B4"/>
      <path d="m61.81 149-1.19 6.56c17.17 6.47 37.57 10.24 63.2 10.24 23.95 0 45.09-3.67 66.16-10.31l-2.66-6.46c-19.48 6.7-37.16 10.43-63.18 10.43-23.43 0-42.01-3.73-62.33-10.46z" fill="#0094B4"/>
    </svg>
  );
}

function BPWordmark({ color = 'var(--color-ink)', size = 'var(--fs-xs)', mono = false }) {
  /* size accepts either a number (px) or a CSS string (var/clamp).
     The logo SVG needs a numeric pixel size — fall back to 1em*1.55 when CSS. */
  const isNumeric = typeof size === 'number';
  return (
    <div style={{
      display:'flex', alignItems:'center', gap: 'var(--gap-tight)', color,
      fontSize: isNumeric ? undefined : size,
    }}>
      <BPLogo size={isNumeric ? size*1.55 : '1.55em'} mono={mono} color={color} />
      <span style={{
        fontWeight: 800,
        fontSize: isNumeric ? size : '1em',
        letterSpacing:'-0.01em', lineHeight: 1,
      }}>BP미디어</span>
    </div>
  );
}

/* ─────────────────────────── Chips ─────────────────────────── */
/* Region chip — solid brand bg + white (or Midnight on Ember).
   Label text is 13px/700; combined with the icon dot + region code, it
   satisfies §3 “Fire Red·Ocean Blue 본문 금지 — 18px bold+ 헤딩·버튼·아이콘·테두리에만”
   under the button-label exception, AND §1 “색상만으로 정보 전달 금지” (color +
   icon + text).                                                                 */
function RegionChip({ region, lang }) {
  const p = REGION_MAP[region];
  const label = (lang === 'en' && p.labelEn) ? p.labelEn : p.label;
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', gap: 'var(--gap-tight)',
      padding: 'var(--gap-tight) 1.4cqw var(--gap-tight) 1cqw',
      background: p.bg, color: p.fg,
      borderRadius: 'var(--radius-chip)',
      fontSize: 'calc(var(--fs-sm) * var(--chip-scale, 1))', fontWeight: 700, letterSpacing:'.02em',
      fontFamily: '"Space Grotesk", Pretendard, system-ui, sans-serif',
      whiteSpace:'nowrap',
    }}>
      <span aria-hidden="true" style={{
        display:'inline-block', width: 6, height: 6, borderRadius: 99,
        background: p.fg, opacity:.85,
      }}/>
      <span style={{ fontWeight: 800 }}>{region}</span>
      <span style={{ fontWeight: 500, opacity:.92 }}>· {label}</span>
    </span>
  );
}

function NSOChip({ label }) {
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', gap: 'var(--gap-micro)',
      padding: 'var(--gap-tight) 1.25cqw',
      background: 'var(--color-white)',
      color: 'var(--color-gray-700)',
      border: '1px solid var(--color-gray-300)',
      borderRadius: 'var(--radius-chip)',
      fontSize: 'calc(var(--fs-xs) * var(--chip-scale, 1))', fontWeight: 600, letterSpacing:'.01em',
      whiteSpace:'nowrap',
    }}>
      <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true">
        <circle cx="6" cy="6" r="2" fill="#8F8F8F" />{/* = --color-gray-500 (§9 SVG exception) */}
        <circle cx="6" cy="6" r="5" stroke="#8F8F8F" strokeWidth=".8" fill="none"/>
      </svg>
      {label}
    </span>
  );
}

/* ─────────────────────────── Image placeholder ─────────────────────────── */
/* Wraps the <image-slot> web component for drag-and-drop. The colored tint
   sits ABOVE the slot as a brand-aligned caption strip — slot itself uses
   image-slot's neutral chrome (dashed ring + “Drop an image”) for clear
   affordance. Each slot needs a stable, unique id (article position).         */
function ImageSlot({ region, hint, slotId, height, src }) {
  const p = REGION_MAP[region];
  return (
    <div style={{
      position:'relative',
      width:'100%',
      height: height || '22cqw',
      borderRadius: 'var(--radius-image)',
      overflow:'hidden',
      flexShrink: 0,
      background: p.tint,
      border: `1px solid color-mix(in oklab, ${p.accent.replace('var(','').replace(')','')}, transparent 70%)`,
    }}>
      <image-slot
        id={`article-${slotId}`}
        src={src || undefined}
        placeholder={hint || '사진을 드래그해서 채우기'}
        shape="rounded"
        radius="0"
        fit="cover"
        style={{
          position:'absolute', inset:0,
          width:'100%', height:'100%',
          display:'block',
        }}
      />
      {/* Brand caption ribbon (always visible — sits above the slot) */}
      <div aria-hidden="true" style={{
        position:'absolute', left:'var(--gap-card)', top:'var(--gap-element)',
        display:'inline-flex', alignItems:'center', gap:'var(--gap-micro)',
        padding:'4px 10px',
        background:'color-mix(in oklab, var(--color-white) 90%, transparent)',
        color:'var(--color-midnight)',
        borderRadius:'var(--radius-chip)',
        fontFamily:'"JetBrains Mono", ui-monospace, monospace',
        fontSize:'var(--fs-xs)', letterSpacing:'.04em',
        pointerEvents:'none', zIndex: 2,
      }}>
        ▣ {hint}
      </div>
    </div>
  );
}

/* ─────────────────────────── Frame ─────────────────────────── */
function CardFrame({ children, bg = 'var(--color-white)', aspect = '1:1', fontScale = 1, footer = true, footerInk, idx, total }) {
  const ratio = aspect === '4:5' ? '4 / 5' : aspect === '9:16' ? '9 / 16' : '1 / 1';
  /* Bake fontScale into the --fs-* tokens at this element so the Tweaks
     slider scales every text token immediately. Inline values guarantee a
     fresh computed value per card and avoid the :root cascade-resolution
     pitfall (where var(--font-scale) was being substituted at definition
     time, not at use time).                                                  */
  /* Pure container-width units → text is ALWAYS the same fraction of the
     card's width, on every screen. The px min/max caps in the old clamp()
     were absolute, so a small-rendered card (e.g. on a short laptop where
     70vh limits the card) hit the min cap and looked oversized, while a
     large monitor hit a different point — breaking proportionality between
     machines. Cards always export at 1080px wide, so 1cqw = 10.8px there;
     the cqw figures below are calibrated to the previous 1080 sizes.        */
  const fs = (mn, vw, mx) =>
    `calc(${vw}cqw * ${fontScale})`;
  const typeTokens = {
    '--font-scale': fontScale,
    '--fs-2xs': fs(11, 1.4,  16),
    '--fs-xs':  fs(13, 1.7,  20),
    '--fs-sm':  fs(15, 2.05, 24),
    '--fs-md':  fs(17, 2.5,  28),
    '--fs-lg':  fs(20, 3.1,  34),
    '--fs-xl':  fs(24, 3.8,  42),
    '--fs-2xl': fs(28, 4.6,  52),
    '--fs-3xl': fs(34, 5.8,  64),
    '--fs-4xl': fs(40, 7.4,  84),
    '--fs-5xl': fs(44, 8.2,  96),
  };
  return (
    <div className="bp-card" style={{
      position:'relative',
      width:'100%',
      aspectRatio: ratio,
      borderRadius: 'var(--radius-card)',
      overflow:'hidden',
      background: bg,
      containerType: 'inline-size',
      ...typeTokens,
      boxShadow:
        '0 1px 0 color-mix(in oklab, white 60%, transparent) inset,' +
        '0 30px 60px -30px color-mix(in oklab, var(--color-midnight) 35%, transparent),' +
        '0 6px 18px -8px color-mix(in oklab, var(--color-ink) 24%, transparent)',
    }}>
      {children}
      {footer && (
        <div style={{
          position:'absolute', left:'var(--gap-section)', right:'var(--gap-section)', bottom: 'var(--gap-card)',
          display:'flex', alignItems:'center', justifyContent:'space-between',
          color: footerInk || 'var(--color-gray-500)',
          fontFamily:'"JetBrains Mono", ui-monospace, monospace',
          fontSize: 'var(--fs-xs)', letterSpacing:'.08em',
          pointerEvents:'none',
        }}>
          <BPWordmark size={'var(--fs-xs)'} color={footerInk || 'var(--color-gray-700)'} mono />
          {idx != null && (
            <span style={{ fontWeight: 500 }}>
              {String(idx).padStart(2,'0')} / {String(total).padStart(2,'0')}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── Cover ─────────────────────────── */
function CoverCard({ idx, total, tweaks }) {
  const primaryBg = PRIMARY_OPTIONS[tweaks.primary]?.bg || PRIMARY_OPTIONS.midnight.bg;
  const articleCount = tweaks.articles?.length ?? 6;
  /* Region chip row — only regions actually used in this issue's articles,
     preserving the canonical REGION_KEYS order so the lineup stays stable
     even when articles are re-ordered. */
  const usedRegions = REGION_KEYS.filter(k =>
    (tweaks.articles ?? []).some(a => a.region === k)
  );
  const langLabel = tweaks.lang === 'en' ? 'EN' : 'KR';
  /* Per-item layout knobs (set in Tweaks → 표지 레이아웃) */
  const s = {
    eyebrow:  tweaks.covScaleEyebrow  ?? 1,
    label:    tweaks.covScaleLabel    ?? 1,
    title:    tweaks.covScaleTitle    ?? 1,
    subtitle: tweaks.covScaleSubtitle ?? 1,
    regions:  tweaks.covScaleRegions  ?? 1,
    footer:   tweaks.covScaleFooter   ?? 1,
  };
  const align = (k, def='left') => tweaks[`covAlign${k}`] ?? def;
  const vAlign = ({ top:'flex-start', center:'center', bottom:'flex-end' })[tweaks.covVAlign ?? 'center'] || 'center';
  /* Map align → justify-content for row-flex items */
  const jc = (a) => ({ left:'flex-start', center:'center', right:'flex-end' })[a] || 'flex-start';
  return (
    <CardFrame idx={idx} total={total} aspect={tweaks.aspect} fontScale={tweaks.fontScale} bg={primaryBg} footer={false}>
      {/* Dot grid (decoration only — no text on pastel here, bg is brand) */}
      {tweaks.bgPattern && (
        <svg width="100%" height="100%" preserveAspectRatio="none" style={{ position:'absolute', inset:0 }}>
          <defs>
            <pattern id="cv-dots" width="22" height="22" patternUnits="userSpaceOnUse">
              <circle cx="2" cy="2" r="1.2" fill="white" fillOpacity=".18"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#cv-dots)"/>
        </svg>
      )}

      <div style={{
        position:'absolute', inset:0,
        paddingTop: `${tweaks.covPadT ?? 32}px`,
        paddingRight: `${tweaks.covPadR ?? 32}px`,
        paddingBottom: `${tweaks.covPadB ?? 32}px`,
        paddingLeft: `${tweaks.covPadL ?? 32}px`,
        display:'flex', flexDirection:'column',
        color: 'var(--color-white)',
      }}>
        {/* 1. Eyebrow — ISSUE + date + language badge */}
        <div style={{
          display:'flex', alignItems:'center', justifyContent:'space-between',
          gap: 'var(--gap-element)',
          fontFamily:'"JetBrains Mono", ui-monospace, monospace',
          fontSize: `calc(var(--fs-xs) * ${s.eyebrow})`, letterSpacing:'.18em',
          color: 'color-mix(in oklab, white 70%, transparent)',
        }}>
          <span>ISSUE · {tweaks.issueNo}</span>
          <div style={{ display:'flex', alignItems:'center', gap:'var(--gap-tight)' }}>
            <span style={{
              padding:'3px 9px',
              border:'1px solid color-mix(in oklab, white 50%, transparent)',
              borderRadius:'var(--radius-chip)',
              color:'var(--color-white)',
              fontWeight: 700,
              letterSpacing:'.14em',
            }}>{langLabel}</span>
            <span>{tweaks.issueDate}</span>
          </div>
        </div>

        {/* 2. Main stack — eyebrow label · big title · subtitle */}
        <div style={{
          flex: 1, display:'flex', flexDirection:'column',
          justifyContent: vAlign, gap:'var(--gap-element)',
        }}>
          {/* Eyebrow label */}
          <div style={{
            display:'inline-flex',
            alignSelf: jc(align('Label')),
            alignItems:'center', gap:'var(--gap-tight)',
            padding:'6px 14px',
            background:'color-mix(in oklab, white 14%, transparent)',
            border:'1px solid color-mix(in oklab, white 30%, transparent)',
            borderRadius:'var(--radius-chip)',
            fontSize:`calc(var(--fs-sm) * ${s.label})`, fontWeight: 700, letterSpacing:'.04em',
          }}>
            <span aria-hidden="true" style={{
              width: 8, height: 8, borderRadius: 99,
              background:'var(--color-white)',
            }}/>
            {pickLang(tweaks, 'weekLabel')}
          </div>

          {/* The dominant title — single huge word block */}
          <h1 style={{
            margin: 0, fontWeight: 900,
            lineHeight: .95, letterSpacing:'-0.035em',
            fontSize: `calc(var(--fs-5xl) * ${s.title})`,
            color: 'var(--color-white)',
            textWrap:'balance',
            textAlign: align('Title'),
          }}>
            {pickLang(tweaks, 'coverTitle') ?? '주요 소식'}
          </h1>

          {/* Subtitle / lede */}
          <p style={{
            margin: 0,
            fontSize: `calc(var(--fs-lg) * ${s.subtitle})`, lineHeight: 1.35,
            color: 'color-mix(in oklab, white 88%, transparent)',
            fontWeight: 500, maxWidth: '85%',
            textWrap:'pretty',
            textAlign: align('Subtitle'),
            marginInline: align('Subtitle') === 'center' ? 'auto' : (align('Subtitle') === 'right' ? '0 0 0 auto' : '0'),
          }}>
            {(pickLang(tweaks, 'coverSubtitle') ?? '주간 좋아요 TOP {n} 기사 · 전세계 스카우트 소식')
              .split(/(\{n\})/)
              .map((part, i) => part === '{n}'
                ? <b key={i} style={{ fontWeight: 800, color:'var(--color-white)' }}>TOP {articleCount}</b>
                : <React.Fragment key={i}>{part}</React.Fragment>
              )}
          </p>

          {/* Region row */}
          <div style={{
            marginTop:'var(--gap-tight)',
            display:'flex', flexWrap:'wrap', gap:'var(--gap-tight)',
            justifyContent: jc(align('Regions')),
            fontFamily:'"Space Grotesk", Pretendard, system-ui, sans-serif',
            fontSize: `calc(var(--fs-xs) * ${s.regions})`, fontWeight: 700, letterSpacing:'.04em',
          }}>
            {usedRegions.map(r =>
              <span key={r} style={{
                padding:'5px 11px',
                border:'1px solid color-mix(in oklab, white 40%, transparent)',
                borderRadius:'var(--radius-chip)',
                color:'color-mix(in oklab, white 92%, transparent)',
              }}>{r}</span>
            )}
          </div>
        </div>

        {/* 3. Footer — BP wordmark + counter + swipe hint */}
        <div style={{
          display:'flex', alignItems:'center', justifyContent:'space-between',
          gap:'var(--gap-card)',
          fontFamily:'"JetBrains Mono", ui-monospace, monospace',
          fontSize: `calc(var(--fs-xs) * ${s.footer})`, letterSpacing:'.10em',
          color: 'color-mix(in oklab, white 78%, transparent)',
        }}>
          <BPWordmark size={'var(--fs-md)'} color="color-mix(in oklab, white 92%, transparent)" mono />
          <span style={{ opacity: .8 }}>
            {String(idx).padStart(2,'0')} / {String(total).padStart(2,'0')}
          </span>
          <span style={{
            display:'inline-flex', alignItems:'center', gap: 'var(--gap-micro)',
            padding:'6px 12px',
            background:'color-mix(in oklab, white 18%, transparent)',
            borderRadius:'var(--radius-chip)',
            color:'var(--color-white)', fontWeight: 600,
          }}>{pickLang(tweaks, 'coverSwipe') ?? 'SWIPE →'}</span>
        </div>
      </div>
    </CardFrame>
  );
}

/* ─────────────────────────── Article ─────────────────────────── */
function ArticleCard({ article, rank, idx, total, tweaks }) {
  const p = REGION_MAP[article.region];
  /* Per-item knobs */
  const sRank   = tweaks.artScaleRank   ?? 1;
  const sChips  = tweaks.artScaleChips  ?? 1;
  const sTitle  = tweaks.artScaleTitle  ?? 1;
  const sBody   = tweaks.artScaleBody   ?? 1;
  const sMeta   = tweaks.artScaleMeta   ?? 1;
  return (
    <CardFrame idx={idx} total={total} aspect={tweaks.aspect} fontScale={tweaks.fontScale}>
      <div style={{
        position:'absolute', inset:0,
        paddingTop:    `${tweaks.artPadT ?? 32}px`,
        paddingRight:  `${tweaks.artPadR ?? 32}px`,
        paddingBottom: `calc(${tweaks.artPadB ?? 32}px + 18px)`,
        paddingLeft:   `${tweaks.artPadL ?? 32}px`,
        display:'flex', flexDirection:'column', gap: 'var(--gap-card)',
      }}>

        {/* Top: rank + likes */}
        <div style={{
          display:'flex', alignItems:'flex-start', justifyContent:'space-between',
          gap: 'var(--gap-card)',
        }}>
          <div style={{ display:'flex', alignItems:'baseline', gap: 'var(--gap-element)' }}>
            <span style={{
              fontFamily:'"Archivo Black", "Space Grotesk", sans-serif',
              fontSize: `calc(var(--fs-4xl) * ${sRank})`, lineHeight: .9, letterSpacing:'-0.04em',
              color: p.accent,
            }}>{String(rank).padStart(2,'0')}</span>
            <span style={{
              fontFamily:'"JetBrains Mono", ui-monospace, monospace',
              fontSize: `calc(var(--fs-xs) * ${sRank})`, letterSpacing:'.14em',
              color:'var(--color-gray-500)',
            }}>TOP·{String(rank).padStart(2,'0')}</span>
          </div>

          {/* Likes pill — text is Midnight (KMS-safe on pastel tint).
              Heart icon uses accent color via currentColor (icon = §3 OK).      */}
          <div style={{
            display:'inline-flex', alignItems:'center', gap: 'var(--gap-micro)',
            padding:'8px 12px',
            borderRadius:'var(--radius-chip)',
            background: p.tint,
            color: 'var(--color-midnight)',
            fontFamily:'"Space Grotesk", sans-serif', fontWeight: 700, fontSize: `calc(var(--fs-md) * ${sChips})`,
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true" style={{ color: p.accent }}>
              {/* eye icon — views */}
              <path d="M12 5C7 5 3 8.5 1 12c2 3.5 6 7 11 7s9-3.5 11-7c-2-3.5-6-7-11-7z" fill="none" stroke="currentColor" strokeWidth="2"/>
              <circle cx="12" cy="12" r="3" fill="currentColor"/>
            </svg>
            {article.likes.toLocaleString()}
          </div>
        </div>

        {/* Chips */}
        <div style={{
          display:'flex', flexWrap:'wrap', gap:'var(--gap-tight)',
          '--chip-scale': sChips,
        }}>
          <RegionChip region={article.region} lang={tweaks.lang} />
          <NSOChip label={pickArticleLang(article, 'nso', tweaks.lang)} />
        </div>

        {/* Image — only render the slot when both the global toggle is on
            AND this card has a non-zero image height. imgHeight===0 means
            "this card intentionally has no image" (and skipping the slot
            also avoids html-to-image errors on zero-height shadow DOM).  */}
        {tweaks.showImage && (article.imgHeight ?? 22) > 0 && (
          <ImageSlot region={article.region} hint={pickArticleLang(article, 'hint', tweaks.lang)}
            slotId={rank}
            src={article.image}
            height={(article.imgHeight ?? 22) + 'cqw'} />
        )}

        {/* Title */}
        <h2 style={{
          margin: 0,
          fontWeight: 900, letterSpacing:'-0.025em',
          lineHeight: 1.18,
          color: 'var(--color-ink)',
          fontSize: `calc(${tweaks.showImage ? 'var(--fs-2xl)' : 'var(--fs-3xl)'} * ${sTitle})`,
          textWrap:'balance',
          whiteSpace:'pre-wrap',
        }}>
          {pickArticleLang(article, 'title', tweaks.lang)}
        </h2>

        {/* Summary */}
        <p style={{
          margin: 0,
          color: 'var(--color-gray-700)', lineHeight: 1.55,
          fontSize: `calc(${tweaks.showImage ? 'var(--fs-lg)' : 'var(--fs-xl)'} * ${sBody})`,
          textWrap:'pretty',
          whiteSpace:'pre-wrap',
        }}>
          {pickArticleLang(article, 'summary', tweaks.lang)}
        </p>

        <div style={{ flex: 1 }}/>

        {/* CTA line — links readers to the full story on BP미디어 */}
        <div style={{
          display:'flex', alignItems:'center', gap:'var(--gap-tight)',
          marginBottom: 'var(--gap-tight)',
          fontFamily:'"Space Grotesk", Pretendard, sans-serif',
          fontSize: `calc(var(--fs-md) * ${sMeta})`,
          fontWeight: 700, letterSpacing:'-0.01em',
          color: p.accent,
        }}>
          {pickLang(tweaks, 'articleCta') ?? 'BP미디어에서 자세히 보기 →'}
        </div>

        {/* Bottom meta — accent stripe + date */}
        <div style={{ display:'flex', alignItems:'center', gap:'var(--gap-element)', marginBottom: 'var(--gap-card)' }}>
          <span aria-hidden="true" style={{
            width: 28, height: 4, borderRadius: 4, background: p.accent,
          }}/>
          <span style={{
            fontFamily:'"JetBrains Mono", ui-monospace, monospace',
            fontSize: `calc(var(--fs-xs) * ${sMeta})`, letterSpacing:'.12em',
            color: 'var(--color-gray-500)',
          }}>{article.date}</span>
        </div>
      </div>
    </CardFrame>
  );
}

/* ─────────────────────────── Ending ─────────────────────────── */
function EndingCard({ idx, total, tweaks }) {
  const primaryBg = PRIMARY_OPTIONS[tweaks.primary]?.bg || PRIMARY_OPTIONS.midnight.bg;
  /* Per-item knobs */
  const sTop      = tweaks.endScaleTop      ?? 1;
  const sTitle    = tweaks.endScaleTitle    ?? 1;
  const sCaption  = tweaks.endScaleCaption  ?? 1;
  const sContacts = tweaks.endScaleContacts ?? 1;
  const sBottom   = tweaks.endScaleBottom   ?? 1;
  return (
    <CardFrame idx={idx} total={total} aspect={tweaks.aspect} fontScale={tweaks.fontScale}
      bg="var(--color-gray-900)" footer={false}>
      {tweaks.bgPattern && (
        <svg width="100%" height="100%" preserveAspectRatio="none" style={{ position:'absolute', inset:0, opacity:.55 }}>
          <defs>
            <pattern id="end-stripes" width="80" height="80" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="80" height="80" fill="transparent"/>
              <line x1="0" y1="0" x2="0" y2="80" stroke="white" strokeOpacity=".04" strokeWidth="40"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#end-stripes)"/>
        </svg>
      )}

      <div style={{
        position:'absolute', inset:0,
        paddingTop:    `${tweaks.endPadT ?? 48}px`,
        paddingRight:  `${tweaks.endPadR ?? 32}px`,
        paddingBottom: `${tweaks.endPadB ?? 32}px`,
        paddingLeft:   `${tweaks.endPadL ?? 32}px`,
        display:'flex', flexDirection:'column',
        color:'var(--color-white)',
      }}>
        {/* Top meta */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <span style={{
            fontFamily:'"JetBrains Mono", ui-monospace, monospace',
            fontSize: `calc(var(--fs-xs) * ${sTop})`, letterSpacing:'.18em',
            color:'color-mix(in oklab, white 60%, transparent)',
          }}>END · {(tweaks.issueDate || '').replace(/\./g,'.').toUpperCase()}</span>
          <span style={{
            fontFamily:'"JetBrains Mono", ui-monospace, monospace',
            fontSize: `calc(var(--fs-xs) * ${sTop})`, letterSpacing:'.12em',
            color:'color-mix(in oklab, white 60%, transparent)',
          }}>← BACK TO START</span>
        </div>

        {/* Body */}
        <div style={{ flex:1, display:'flex', flexDirection:'column', justifyContent:'center' }}>
          <BPLogo size={'var(--fs-5xl)'}/>
          <div style={{
            marginTop:'var(--gap-section)',
            fontFamily:'"Space Grotesk", Pretendard, sans-serif',
            fontSize: `calc(var(--fs-sm) * ${sCaption})`, letterSpacing:'.2em',
            color:'color-mix(in oklab, white 55%, transparent)',
            textTransform:'uppercase',
          }}>
            Worldwide Scouting News
          </div>
          <h2 style={{
            margin:'var(--gap-element) 0 0',
            fontWeight: 900, letterSpacing:'-0.028em', lineHeight: 1.05,
            fontSize:`calc(var(--fs-3xl) * ${sTitle})`,
          }}>
            {pickLang(tweaks, 'endingLine1')}<br/>
            <span style={{
              display:'inline-block',
              padding:'0 12px 4px',
              background: primaryBg,
              color: 'var(--color-white)',
              borderRadius: 10,
              marginTop: 6,
            }}>{pickLang(tweaks, 'endingLine2')}</span>
            <span>{pickLang(tweaks, 'endingLine2Suffix')}</span>
          </h2>

          {/* CTA button — primary call-to-action that closes the deck */}
          <a href="#" onClick={(e)=>e.preventDefault()} style={{
            marginTop: 'var(--gap-section)',
            alignSelf:'flex-start',
            display:'inline-flex', alignItems:'center', gap:'var(--gap-tight)',
            padding:'14px 22px',
            background:'var(--color-white)',
            color: primaryBg,
            borderRadius:'var(--radius-chip)',
            fontFamily:'"Space Grotesk", Pretendard, sans-serif',
            fontSize:`calc(var(--fs-md) * ${sCaption})`,
            fontWeight: 700, letterSpacing:'-0.005em',
            textDecoration:'none',
            boxShadow:'0 8px 24px -8px color-mix(in oklab, white 40%, transparent)',
          }}>
            <span aria-hidden="true" style={{
              width: 10, height: 10, borderRadius: 99, background: primaryBg, opacity:.9,
            }}/>
            {pickLang(tweaks, 'endingCta') ?? '구독하고 매주 받아보기 →'}
          </a>

          <div style={{
            marginTop: 'var(--gap-section-out)',
            display:'grid', gridTemplateColumns:'1fr 1fr',
            gap: 'var(--gap-card)',
            fontFamily:'"Space Grotesk", Pretendard, sans-serif',
          }}>
            {[
              { k:'WEB',       v: pickLang(tweaks, 'contactWeb') },
              { k:'INSTAGRAM', v: pickLang(tweaks, 'contactInsta') },
              { k: tweaks.lang === 'en' ? 'STORY TIPS' : '기사제보', v: pickLang(tweaks, 'contactStory') },
              { k: tweaks.lang === 'en' ? 'INQUIRIES'  : '문의',     v: pickLang(tweaks, 'contactInfo') },
            ].map(x => (
              <div key={x.k} style={{
                padding:'12px 14px',
                border:'1px solid color-mix(in oklab, white 18%, transparent)',
                borderRadius:'var(--radius-element)',
              }}>
                <div style={{
                  fontFamily:'"JetBrains Mono", ui-monospace, monospace',
                  fontSize: `calc(var(--fs-2xs) * ${sContacts})`, letterSpacing:'.16em',
                  color:'color-mix(in oklab, white 50%, transparent)',
                }}>{x.k}</div>
                <div style={{ marginTop: 'var(--gap-micro)', fontSize: `calc(var(--fs-md) * ${sContacts})`, fontWeight: 600 }}>{x.v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom */}
        <div style={{
          display:'flex', alignItems:'center', justifyContent:'space-between',
          fontFamily:'"JetBrains Mono", ui-monospace, monospace',
          fontSize: `calc(var(--fs-xs) * ${sBottom})`, letterSpacing:'.1em',
          color:'color-mix(in oklab, white 55%, transparent)',
        }}>
          <span>© 2026 BP MEDIA</span>
          <span>{String(idx).padStart(2,'0')} / {String(total).padStart(2,'0')}</span>
        </div>
      </div>
    </CardFrame>
  );
}

Object.assign(window, {
  BPLogo, BPWordmark, RegionChip, NSOChip, ImageSlot,
  CardFrame, CoverCard, ArticleCard, EndingCard,
});
