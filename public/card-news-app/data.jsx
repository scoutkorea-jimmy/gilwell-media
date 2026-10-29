/* data.jsx — region styling + cover primary options.
   Article content now lives in TWEAK_DEFAULTS (index.html) so each field is
   live-editable from the Tweaks panel and persisted by the host editor.       */

const REGION_MAP = {
  WOSM:  { bg: 'var(--color-gray-900)', fg: 'var(--color-white)',    accent: 'var(--color-gray-900)', tint: 'color-mix(in oklab, var(--color-gray-900) 10%, var(--color-white))', label: '세계연맹',          labelEn: 'World' },
  KOREA: { bg: 'var(--color-ocean)',    fg: 'var(--color-white)',    accent: 'var(--color-ocean)',    tint: 'color-mix(in oklab, var(--color-ocean) 14%, var(--color-white))',    label: '한국',          labelEn: 'Korea' },
  APR:   { bg: 'var(--color-fire)',     fg: 'var(--color-white)',    accent: 'var(--color-fire)',     tint: 'color-mix(in oklab, var(--color-fire) 14%, var(--color-white))',     label: '아시아·태평양',  labelEn: 'Asia-Pacific' },
  EUR:   { bg: 'var(--color-midnight)', fg: 'var(--color-white)',    accent: 'var(--color-midnight)', tint: 'color-mix(in oklab, var(--color-midnight) 12%, var(--color-white))', label: '유럽',          labelEn: 'Europe' },
  ARB:   { bg: 'var(--color-forest)',   fg: 'var(--color-white)',    accent: 'var(--color-forest)',   tint: 'color-mix(in oklab, var(--color-forest) 14%, var(--color-white))',   label: '아랍',          labelEn: 'Arab' },
  AFR:   { bg: 'var(--color-ember)',    fg: 'var(--color-midnight)', accent: 'var(--color-ember)',    tint: 'color-mix(in oklab, var(--color-ember) 30%, var(--color-white))',    label: '아프리카',       labelEn: 'Africa' },
  IAR:   { bg: 'var(--color-scouting)', fg: 'var(--color-white)',    accent: 'var(--color-scouting)', tint: 'color-mix(in oklab, var(--color-scouting) 14%, var(--color-white))', label: '미주',          labelEn: 'Inter-American' },
};

const REGION_KEYS = ['WOSM', 'KOREA', 'APR', 'EUR', 'ARB', 'AFR', 'IAR'];

const PRIMARY_OPTIONS = {
  midnight: { bg: 'var(--color-midnight)', label: 'Midnight' },
  scouting: { bg: 'var(--color-scouting)', label: 'Scouting' },
  forest:   { bg: 'var(--color-forest)',   label: 'Forest'   },
};

Object.assign(window, { REGION_MAP, REGION_KEYS, PRIMARY_OPTIONS, pickLang, pickArticleLang });

/* Language picker — returns en field if lang='en' and an EN value exists,
   otherwise falls back to the KR field. Used by cards to render text. */
function pickLang(tweaks, key) {
  if (tweaks?.lang === 'en') {
    const en = tweaks[key + 'En'];
    if (en !== undefined && en !== null && en !== '') return en;
  }
  return tweaks?.[key];
}
function pickArticleLang(article, key, lang) {
  if (lang === 'en') {
    const en = article?.[key + 'En'];
    if (en !== undefined && en !== null && en !== '') return en;
  }
  return article?.[key];
}
