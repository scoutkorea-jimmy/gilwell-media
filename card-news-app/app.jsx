/* app.jsx — carousel preview + Tweaks (visual + content editor) */

/* var (not const): 전역 스코프 공유 — cards.jsx 와 React 구조분해가 겹쳐
   const 면 'useState already declared' 충돌. */
var { useState, useMemo, useEffect, useCallback } = React;

/* ──────── PNG export helpers ──────── */
/* Capture the live center card at the carousel's CURRENT size and scale up
   to 1080-class native resolution via html-to-image's pixelRatio. We render
   into the user's already-mounted card (not an off-screen React tree) so
   shadow-DOM image-slot content and CSS container-query units come along
   without re-mount weirdness.                                              */
/* Capture the live center card and return its PNG as a Blob — used both by
   the single-card download path (which writes via <a download>) and the
   zip path (which collects Blobs into a JSZip archive).                    */
/* Format any thrown value into a useful message string. html-to-image
   sometimes rejects with an Event (from an <img>.onerror inside a shadow
   root), which has no `.message` — that's why earlier alerts read
   "undefined" or "[object Event]". */
function formatErr(e) {
  if (!e) return 'unknown';
  if (e instanceof Event) {
    const t = e.target;
    const src = t && (t.src || t.currentSrc || t.href);
    return `Resource error${src ? ' (' + src.slice(0, 80) + ')' : ''}`;
  }
  if (e.message) return e.message;
  if (typeof e === 'string') return e;
  try { return JSON.stringify(e); } catch { return String(e); }
}

/* Single capture attempt — try toBlob, then toPng fallback. */
async function _captureAttempt(node, ratio) {
  let blob = null;
  try {
    blob = await window.htmlToImage.toBlob(node, { pixelRatio: ratio, cacheBust: true });
  } catch (e) {
    console.warn('toBlob failed; trying toPng:', formatErr(e));
  }
  if (!blob) {
    const dataUrl = await window.htmlToImage.toPng(node, { pixelRatio: ratio, cacheBust: true });
    if (!dataUrl) throw new Error('Capture produced empty data');
    const resp = await fetch(dataUrl);
    blob = await resp.blob();
  }
  if (!blob) throw new Error('Capture produced no image data');
  return blob;
}

async function captureCardPngBlob() {
  const cards = Array.from(document.querySelectorAll('.bp-card'));
  if (!cards.length) throw new Error('No cards rendered');
  const cw = window.innerWidth;
  let best = null, bestScore = -Infinity;
  for (const el of cards) {
    const r = el.getBoundingClientRect();
    if (r.width < 200) continue;
    const score = r.width - Math.abs((r.left + r.width / 2) - cw / 2);
    if (score > bestScore) { bestScore = score; best = el; }
  }
  if (!best) throw new Error('Could not locate the active card');

  if (document.fonts && document.fonts.ready) await document.fonts.ready;
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  await new Promise(r => setTimeout(r, 60));

  const w = best.offsetWidth;
  const TARGET = 1080;
  const ratio = Math.max(1, Math.min(3, TARGET / Math.max(1, w)));

  const orig = { boxShadow: best.style.boxShadow };
  best.style.boxShadow = 'none';
  try {
    try {
      return await _captureAttempt(best, ratio);
    } catch (e1) {
      // Most common cause: an <image-slot>'s shadow-DOM <img> failed to
      // load (stale sidecar entry, decode error, etc) and html-to-image
      // bubbled the Event. Hide the slots and retry — the colored
      // placeholder wrapper + brand ribbon still render cleanly without
      // the photo.
      console.warn('Card capture failed; retrying without <image-slot>:', formatErr(e1));
      const slots = Array.from(best.querySelectorAll('image-slot'));
      const saved = slots.map(s => ({ s, display: s.style.display }));
      slots.forEach(s => { s.style.display = 'none'; });
      try {
        return await _captureAttempt(best, ratio);
      } finally {
        saved.forEach(({ s, display }) => { s.style.display = display; });
      }
    }
  } finally {
    best.style.boxShadow = orig.boxShadow;
  }
}

const safeFile = (s) => (s ?? '').toString().replace(/[\\/:*?"<>|]+/g, '').trim();

/* Single-card download */
async function exportCardPng({ fileNameBase }) {
  const blob = await captureCardPngBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.download = `${safeFile(fileNameBase)}.png`;
  a.href = url;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function ExportButtons({ tweaks, active, setActive }) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [saving, setSaving] = useState(false);
  const total = tweaks.articles.length + 2;
  const isEn = tweaks.lang === 'en';

  // 서버 저장 — 현재 tweaks(편집 상태) 전체를 D1 card_news.data 에 PUT.
  // 원본 기사는 건드리지 않는다(카드뉴스 데이터만 갱신).
  const saveToServer = async () => {
    if (saving) return;
    const id = window.CARD_NEWS_ID;
    if (!id) { alert('저장 대상이 없습니다 (CARD_NEWS_ID 누락).'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/admin/card-news/' + id, {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: tweaks }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.reason || j.error || ('HTTP ' + res.status));
      try { window.parent.postMessage({ type: '__card_news_saved', id: id }, '*'); } catch (_) {}
      alert(isEn ? 'Saved to server.' : '서버에 저장했습니다.');
    } catch (e) {
      alert((isEn ? 'Save failed: ' : '저장 실패: ') + (e && e.message ? e.message : e));
    }
    setSaving(false);
  };

  const fileBaseFor = (i) => {
    const issue = (tweaks.weekLabel || '').replace(/\s+/g, '');
    const lang = tweaks.lang === 'en' ? 'EN' : 'KR';
    if (i === 0)         return `BPMedia_${issue}_${lang}_01_cover`;
    if (i === total - 1) return `BPMedia_${issue}_${lang}_${String(total).padStart(2,'0')}_ending`;
    const a = tweaks.articles[i - 1];
    return `BPMedia_${issue}_${lang}_${String(i+1).padStart(2,'0')}_${a.name || a.region}`;
  };

  const downloadCurrent = async () => {
    if (busy) return;
    setBusy(true);
    try { await exportCardPng({ fileNameBase: fileBaseFor(active) }); }
    catch (e) { console.error(e); alert('이미지 저장 중 오류: ' + formatErr(e)); }
    setBusy(false);
  };

  const downloadAll = async () => {
    if (busy) return;
    if (!window.JSZip) { alert('JSZip 라이브러리를 불러오지 못했어요.'); return; }
    setBusy(true);
    setProgress({ i: 0, n: total });
    const errors = [];
    try {
      const zip = new window.JSZip();
      let captured = 0;
      for (let i = 0; i < total; i++) {
        setActive(i);
        // Give the carousel + image-slot a moment to settle on the new card.
        await new Promise(r => setTimeout(r, 700));
        try {
          const blob = await captureCardPngBlob();
          zip.file(`${safeFile(fileBaseFor(i))}.png`, blob);
          captured++;
        } catch (e) {
          console.error(`Card ${i+1} capture failed:`, e);
          errors.push(`${i+1}: ${formatErr(e)}`);
        }
        setProgress({ i: i + 1, n: total });
      }
      if (captured === 0) throw new Error('한 장도 캡처하지 못했어요. 콘솔에서 확인해주세요.');
      const zipBlob = await zip.generateAsync({ type:'blob' });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      const issue = (tweaks.weekLabel || 'issue').replace(/\s+/g, '');
      const lang = tweaks.lang === 'en' ? 'EN' : 'KR';
      a.download = safeFile(`BPMedia_${issue}_${lang}_전체.zip`);
      a.href = url;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      if (errors.length) alert(`일부 카드 캡처 실패 (${errors.length}/${total}):\n` + errors.join('\n'));
    } catch (e) {
      console.error(e);
      alert('ZIP 저장 중 오류: ' + formatErr(e));
    }
    setProgress(null);
    setBusy(false);
  };

  const btnBase = {
    display:'inline-flex', alignItems:'center', gap:'var(--gap-tight)',
    padding:'10px 14px',
    borderRadius:'var(--radius-element)',
    border:'1px solid var(--color-gray-300)',
    background:'var(--color-white)',
    color:'var(--color-ink)',
    fontFamily:'inherit', fontSize: 13, fontWeight: 600,
    cursor: busy ? 'progress' : 'pointer',
    opacity: busy ? .65 : 1,
    transition: 'background .15s, border-color .15s, transform .1s',
  };
  const btnPrimary = {
    ...btnBase,
    background:'var(--color-midnight)',
    color:'var(--color-white)',
    border:'1px solid var(--color-midnight)',
  };

  return (
    <div style={{
      display:'flex', alignItems:'center', gap:'var(--gap-tight)',
      flexWrap:'wrap',
    }}>
      <button type="button"
        style={{ ...btnPrimary, background:'var(--color-forest)', borderColor:'var(--color-forest)', opacity: saving ? .65 : 1, cursor: saving ? 'progress' : 'pointer' }}
        onClick={saveToServer} disabled={saving}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
          <polyline points="17 21 17 13 7 13 7 21"/>
          <polyline points="7 3 7 8 15 8"/>
        </svg>
        {saving ? (isEn ? 'Saving…' : '저장 중…') : (isEn ? 'Save to server' : '서버 저장')}
      </button>
      <button type="button" style={btnBase} onClick={downloadCurrent} disabled={busy}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        {isEn ? 'Save current as PNG' : '현재 카드 PNG 저장'}
      </button>
      <button type="button" style={btnPrimary} onClick={downloadAll} disabled={busy}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        {progress
          ? `${isEn ? 'Zipping' : 'ZIP 만드는 중'} ${progress.i}/${progress.n}`
          : (isEn ? `Download all as ZIP (${total})` : `전체 ZIP 다운로드 (${total}장)`)}
      </button>
    </div>
  );
}

/* ──────── Multi-line text input for tweaks (title/summary etc) ──────── */
function TweakTextarea({ label, value, placeholder, rows = 3, onChange }) {
  return (
    <TweakRow label={label}>
      <textarea className="twk-ta" rows={rows} value={value ?? ''}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)} />
    </TweakRow>
  );
}

/* ──────── Collapsible group wrapping multiple TweakSection blocks ──────── */
function TweakGroup({ title, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="twk-group" data-open={open ? 'true' : 'false'}>
      <button type="button" className="twk-group-hd"
              aria-expanded={open}
              onClick={() => setOpen(o => !o)}>
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M2 3l3 4 3-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <span style={{ flex: 1 }}>{title}</span>
      </button>
      <div className="twk-group-body">{children}</div>
    </div>
  );
}

function CardForIndex({ i, total, tweaks }) {
  if (i === 0) return <CoverCard idx={i+1} total={total} tweaks={tweaks} />;
  if (i === total - 1) return <EndingCard idx={i+1} total={total} tweaks={tweaks} />;
  const article = tweaks.articles[i - 1];
  return <ArticleCard article={article} rank={i} idx={i+1} total={total} tweaks={tweaks} />;
}

function PageHeader({ tweaks, active, setActive }) {
  return (
    <header style={{
      display:'flex', alignItems:'flex-end', justifyContent:'space-between',
      flexWrap:'wrap', gap:'var(--gap-section)',
      marginBottom:'var(--gap-section-out)',
    }}>
      <div>
        <div style={{
          display:'inline-flex', alignItems:'center', gap:'var(--gap-tight)',
          padding:'6px 10px',
          background:'var(--color-white)',
          border:'1px solid var(--color-gray-300)',
          borderRadius:'var(--radius-chip)',
          fontFamily:'"JetBrains Mono", ui-monospace, monospace',
          fontSize: 11, letterSpacing:'.16em', color:'var(--color-gray-700)',
          textTransform:'uppercase',
        }}>
          <span aria-hidden="true" style={{
            width:6, height:6, borderRadius:99, background:'var(--color-fire)',
          }}/>
          Carousel Preview · 1080×1080
        </div>
        <h1 style={{
          margin:'var(--gap-element) 0 var(--gap-tight)',
          fontWeight:900, letterSpacing:'-0.028em',
          fontSize:'clamp(28px, 4vw, 44px)',
          lineHeight: 1.1,
          color: 'var(--color-ink)',
        }}>
          {tweaks.lang === 'en'
            ? <>BP Media <span style={{ color:'var(--color-midnight)' }}>{tweaks.weekLabelEn || tweaks.weekLabel}</span> Highlights</>
            : <>BP미디어 <span style={{ color:'var(--color-midnight)' }}>{tweaks.weekLabel}</span> 주요 소식</>}
        </h1>
        <p style={{
          margin:0, color:'var(--color-gray-700)', fontSize: 15, maxWidth: 580,
        }}>
          주간 가장 많은 좋아요를 받은 6개 기사. 표지와 엔딩을 포함해 총 8장의 카드뉴스로 발행. 우측 하단 <b>Tweaks</b>로 모든 내용을 실시간 편집·저장하세요.
        </p>
      </div>

      <div style={{
        display:'flex', flexDirection:'column', alignItems:'flex-end',
        gap:'var(--gap-element)',
      }}>
        <ExportButtons tweaks={tweaks} active={active} setActive={setActive} />
        <div style={{
          display:'flex', alignItems:'center', gap:'var(--gap-card)',
          padding:'var(--gap-element) var(--gap-card)',
          background:'var(--color-white)',
          border:'1px solid var(--color-gray-300)',
          borderRadius:'var(--radius-element)',
        }}>
          <BPLogo size={36}/>
          <div style={{ display:'flex', flexDirection:'column' }}>
            <span style={{
              fontFamily:'"JetBrains Mono", ui-monospace, monospace',
              fontSize: 10, letterSpacing:'.14em', color:'var(--color-gray-500)',
            }}>ISSUE · {tweaks.issueNo}</span>
            <span style={{ fontWeight: 700, fontSize: 14, color:'var(--color-ink)' }}>
              {tweaks.issueDate}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}

function NavButton({ dir, onClick, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled} aria-label={dir === -1 ? '이전' : '다음'} style={{
      position:'absolute',
      top:'50%', transform:'translateY(-50%)',
      [dir === -1 ? 'left' : 'right']: '-22px',
      width: 56, height: 56, borderRadius:'50%',
      background:'var(--color-white)',
      border:'1px solid var(--color-gray-300)',
      boxShadow:'0 10px 24px -10px color-mix(in oklab, var(--color-midnight) 30%, transparent)',
      color:'var(--color-midnight)',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? .4 : 1,
      display:'grid', placeItems:'center',
      zIndex: 5,
      transition:'transform .15s ease, box-shadow .15s ease',
    }}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {dir === -1 ? <polyline points="15 18 9 12 15 6"/> : <polyline points="9 18 15 12 9 6"/>}
      </svg>
    </button>
  );
}

function Carousel({ tweaks, active, setActive, embed = false }) {
  const total = tweaks.articles.length + 2;
  const aspectW = tweaks.aspect === '4:5' ? 4 : tweaks.aspect === '9:16' ? 9 : 1;
  const aspectH = tweaks.aspect === '4:5' ? 5 : tweaks.aspect === '9:16' ? 16 : 1;

  const go = useCallback((delta) => {
    setActive(a => Math.max(0, Math.min(total - 1, a + delta)));
  }, [total, setActive]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go]);

  // clamp active when total changes
  useEffect(() => {
    if (active >= total) setActive(total - 1);
  }, [total, active, setActive]);

  return (
    <section>
      <div style={{
        position:'relative',
        padding:'var(--gap-section) 0 var(--gap-section)',
      }}>
        <div style={{
          position:'relative',
          maxWidth: 1080, margin:'0 auto',
          aspectRatio: `${aspectW} / ${aspectH}`,
          maxHeight: '76vh',
        }}>
          <div style={{
            position:'absolute', inset:0,
            display:'flex', alignItems:'center', justifyContent:'center',
            perspective:'1400px',
          }}>
            {[active-1, active, active+1].map((i) => {
              if (i < 0 || i >= total) return null;
              const offset = i - active;
              const isCenter = offset === 0;
              return (
                <div key={i} style={{
                  position:'absolute',
                  top:0, bottom:0,
                  aspectRatio:`${aspectW} / ${aspectH}`,
                  transform: `translateX(${offset * 92}%) scale(${isCenter ? 1 : .78})`,
                  filter: isCenter ? 'none' : 'saturate(.5) brightness(.94)',
                  opacity: isCenter ? 1 : .42,
                  transition:'transform .45s cubic-bezier(.22,1,.36,1), opacity .35s, filter .35s',
                  pointerEvents: isCenter ? 'auto' : 'none',
                  zIndex: isCenter ? 2 : 1,
                }}>
                  <CardForIndex i={i} total={total} tweaks={tweaks} />
                </div>
              );
            })}
          </div>

          <NavButton dir={-1} onClick={() => go(-1)} disabled={active === 0}/>
          <NavButton dir={ 1} onClick={() => go( 1)} disabled={active === total-1}/>
        </div>
      </div>

      {/* 카드 순서 변경(썸네일 드래그)은 화면 하단 고정 도크(ThumbnailDock)로 분리됨 */}

      <div style={{
        display:'flex', alignItems:'center',
        justifyContent: embed ? 'center' : 'space-between',
        marginTop:'var(--gap-card)',
        fontFamily:'"JetBrains Mono", ui-monospace, monospace',
        fontSize: 12, letterSpacing:'.12em',
        color:'var(--color-gray-700)',
      }}>
        {!embed && <span>SLIDE {String(active+1).padStart(2,'0')} / {String(total).padStart(2,'0')}</span>}
        <div style={{ display:'flex', gap: 6 }}>
          {Array.from({ length: total }, (_, i) => (
            <button key={i} aria-label={`${i+1}`} onClick={() => setActive(i)} style={{
              width: i === active ? 22 : 6, height: 6,
              borderRadius: 99, padding: 0, border: 'none', cursor: 'pointer',
              background: i === active ? 'var(--color-midnight)' : 'var(--color-gray-300)',
              transition:'width .25s',
            }}/>
          ))}
        </div>
        {!embed && <span>USE ← → · CLICK THUMBS</span>}
      </div>
    </section>
  );
}

/* ─────────────────────────── Tweaks ─────────────────────────── */
function TweaksUI({ tweaks, setTweak, active, setActive }) {
  // editing index: tweaks.editing maps to article index (0..articles.length-1)
  const articleIdx = Math.max(0, Math.min(tweaks.articles.length - 1, tweaks.editing || 0));
  const article = tweaks.articles[articleIdx] || {}; // 빈 articles 방어 (크래시 방지)
  const isEn = tweaks.lang === 'en';
  const suffix = isEn ? 'En' : '';
  /* Read a language-aware text field (falls back to KR if EN empty). */
  const txVal = (k) => tweaks[k + suffix] ?? '';
  const setTx = (k, v) => setTweak(k + suffix, v);
  /* Read/write a language-aware article field. */
  const artTxVal = (k) => article?.[k + suffix] ?? '';
  const setArtTx = (k, v) => setArticleField(k + suffix, v);

  const setArticleField = (field, value) => {
    setTweak('articles', tweaks.articles.map((a, i) =>
      i === articleIdx ? { ...a, [field]: value } : a
    ));
  };

  // When user picks a card from the editor, also navigate the carousel.
  const pickArticle = (i) => {
    setTweak('editing', i);
    setActive(i + 1); // +1 because carousel idx 0 = cover
  };

  /* ── Card mutations: add / duplicate / delete / move ─────────────────
     Pure transforms of the articles array, with `editing` updated so the
     picker keeps pointing at the user's expected card after the action.
     setActive(+1) keeps the carousel aligned (cover at index 0).         */
  const addArticle = () => {
    const next = {
      name: isEn ? 'New card' : '새 카드',
      nameEn: 'New card',
      region: 'KOREA',
      nso: '', nsoEn: '',
      date: tweaks.issueDate ?? '',
      title: isEn ? 'Title' : '제목',
      titleEn: 'Title',
      summary: '', summaryEn: '',
      likes: 0, views: 0,
      hint: '', hintEn: '',
      imgHeight: 22, imgView: { s: 1, x: 0, y: 0 }, image: '',
    };
    const newIdx = tweaks.articles.length;
    setTweak('articles', [...tweaks.articles, next]);
    setTweak('editing', newIdx);
    setActive(newIdx + 1);
  };
  const duplicateArticle = () => {
    const copy = { ...article, name: (article.name || '') + ' (사본)' };
    const list = [...tweaks.articles];
    list.splice(articleIdx + 1, 0, copy);
    setTweak('articles', list);
    setTweak('editing', articleIdx + 1);
    setActive(articleIdx + 2);
  };
  const deleteArticle = () => {
    if (tweaks.articles.length <= 1) return; // keep at least one
    const list = tweaks.articles.filter((_, i) => i !== articleIdx);
    const newIdx = Math.min(articleIdx, list.length - 1);
    setTweak('articles', list);
    setTweak('editing', newIdx);
    setActive(newIdx + 1);
  };
  const moveArticle = (dir) => {
    const j = articleIdx + dir;
    if (j < 0 || j >= tweaks.articles.length) return;
    const list = [...tweaks.articles];
    [list[articleIdx], list[j]] = [list[j], list[articleIdx]];
    setTweak('articles', list);
    setTweak('editing', j);
    setActive(j + 1);
  };

  return (
    <TweaksPanel>
      <TweakSection label="언어 / Language" />
      <TweakRadio  label="버전" value={tweaks.lang ?? 'kr'}
                   options={[
                     { value:'kr', label:'한국어' },
                     { value:'en', label:'English' },
                   ]}
                   onChange={(v) => setTweak('lang', v)} />

      {/* ── 1. 기사 편집 (current card) — always open, top priority ── */}
      <TweakGroup
        title={isEn
          ? `Edit Card · ${String(articleIdx+1).padStart(2,'0')}/${String(tweaks.articles.length).padStart(2,'0')}`
          : `기사 편집 · ${String(articleIdx+1).padStart(2,'0')}/${String(tweaks.articles.length).padStart(2,'0')}`}
        defaultOpen={true}>
        <TweakRadio  label={isEn ? 'Card' : '편집 카드'} value={articleIdx}
                     options={tweaks.articles.map((a, i) => ({
                       value: i,
                       label: `${String(i+1).padStart(2,'0')} · ${a.name || a.region}`,
                     }))}
                     onChange={pickArticle} />

        {/* 발행 기사에서 카드 자동 생성 (제목·요약·날짜·좋아요·대표이미지). NSO/Region 은 수동 */}
        <button type="button" className="twk-btn"
          onClick={() => window.dispatchEvent(new CustomEvent('cn-open-import'))}
          style={{ width: '100%', justifyContent: 'center', background: 'var(--color-midnight)', color: '#fff', fontWeight: 600, marginBottom: 6 }}
          title={isEn ? 'Import from published articles' : '발행 기사에서 불러오기'}>
          ⤓ {isEn ? 'Import articles' : '기사 불러오기'}
        </button>

        {/* Card management row — add / move / duplicate / delete */}
        <div className="twk-row twk-row-h" style={{ gap: 6 }}>
          <div className="twk-lbl"><span>{isEn ? 'Manage' : '카드 관리'}</span></div>
          <div style={{ display:'flex', gap: 4, flexWrap:'wrap', justifyContent:'flex-end' }}>
            <button type="button" className="twk-btn" onClick={addArticle}
                    title={isEn ? 'Add card' : '카드 추가'}>+ {isEn ? 'Add' : '추가'}</button>
            <button type="button" className="twk-btn secondary" onClick={() => moveArticle(-1)}
                    disabled={articleIdx === 0}
                    title={isEn ? 'Move up' : '위로'}>↑</button>
            <button type="button" className="twk-btn secondary" onClick={() => moveArticle(1)}
                    disabled={articleIdx === tweaks.articles.length - 1}
                    title={isEn ? 'Move down' : '아래로'}>↓</button>
            <button type="button" className="twk-btn secondary" onClick={duplicateArticle}
                    title={isEn ? 'Duplicate' : '복제'}>⎘</button>
            <button type="button" className="twk-btn secondary" onClick={deleteArticle}
                    disabled={tweaks.articles.length <= 1}
                    title={isEn ? 'Delete' : '삭제'}
                    style={{ color: '#b3261e' }}>✕</button>
          </div>
        </div>
        <TweakText   label={isEn ? 'Card name' : '카드명'}      value={artTxVal('name')}
                     placeholder={`${article.region} ${isEn ? 'article name' : '기사 이름'}`}
                     onChange={(v) => setArtTx('name', v)} />
        <TweakRadio  label={isEn ? 'Region' : '지역연맹'} value={article.region}
                     options={REGION_KEYS.map(k => ({
                       value: k, label: `${k} · ${isEn && REGION_MAP[k].labelEn ? REGION_MAP[k].labelEn : REGION_MAP[k].label}`,
                     }))}
                     onChange={(v) => setArticleField('region', v)} />
        <TweakText   label={isEn ? 'NSO/Local' : 'NSO/지방'}   value={artTxVal('nso')}
                     onChange={(v) => setArtTx('nso', v)} />
        <TweakText   label={isEn ? 'Date' : '날짜'}       value={article.date}
                     onChange={(v) => setArticleField('date', v)} />
        <TweakTextarea label={isEn ? 'Title' : '제목'}    value={artTxVal('title')}
                       placeholder={isEn ? 'Press Enter for line break' : '엔터로 줄바꿈'}
                       onChange={(v) => setArtTx('title', v)} />
        <TweakTextarea label={isEn ? 'Summary' : '요약'}  value={artTxVal('summary')}
                       placeholder={isEn ? 'Press Enter for line break' : '엔터로 줄바꿈'}
                       rows={5}
                       onChange={(v) => setArtTx('summary', v)} />
        <TweakNumber label={isEn ? 'Views' : '조회수'}     value={article.views ?? article.likes ?? 0} min={0} step={1}
                     onChange={(v) => setArticleField('views', v)} />
        <TweakText   label={isEn ? 'Image caption' : '이미지 캡션'} value={artTxVal('hint')}
                     onChange={(v) => setArtTx('hint', v)} />
        {tweaks.showImage && (
          <TweakSlider label={isEn ? 'Image height' : '이미지 높이'}
                       value={article.imgHeight ?? 22}
                       min={0} max={48} step={1} unit="cqw"
                       onChange={(v) => setArticleField('imgHeight', v)} />
        )}
      </TweakGroup>

      {/* ── 2. 발행 정보 · 텍스트 ── */}
      <TweakGroup title={isEn ? 'Issue Info & Text' : '발행 정보 · 텍스트'} defaultOpen={true}>
        <TweakSection label={isEn ? 'Issue' : '발행'} />
        <TweakText   label={isEn ? 'Week label' : '주차 라벨'}   value={txVal('weekLabel')}
                     onChange={(v) => setTx('weekLabel', v)} />
        <TweakText   label={isEn ? 'Issue no.'  : '발행 번호'}   value={tweaks.issueNo}
                     onChange={(v) => setTweak('issueNo', v)} />
        <TweakText   label={isEn ? 'Issue date' : '발행일'}      value={tweaks.issueDate}
                     onChange={(v) => setTweak('issueDate', v)} />

        <TweakSection label={isEn ? 'Cover' : '표지'} />
        <TweakTextarea label={isEn ? 'Title' : '제목'}    value={txVal('coverTitle')}
                       onChange={(v) => setTx('coverTitle', v)} />
        <TweakTextarea label={isEn ? 'Subtitle' : '부제'} value={txVal('coverSubtitle')}
                       placeholder={isEn ? '{n} = article count' : '{n} = 기사 수'}
                       onChange={(v) => setTx('coverSubtitle', v)} />
        <TweakText   label="SWIPE"  value={txVal('coverSwipe')}
                     onChange={(v) => setTx('coverSwipe', v)} />

        <TweakSection label="CTA" />
        <TweakText   label={isEn ? 'Article CTA' : '기사 CTA'} value={txVal('articleCta')}
                     onChange={(v) => setTx('articleCta', v)} />
        <TweakText   label={isEn ? 'Ending CTA'  : '엔딩 CTA'}  value={txVal('endingCta')}
                     onChange={(v) => setTx('endingCta', v)} />
      </TweakGroup>

      {/* ── 3. 비주얼 ── */}
      <TweakGroup title={isEn ? 'Visual' : '비주얼'} defaultOpen={true}>
        <TweakRadio  label={isEn ? 'Main color' : '메인 컬러'} value={tweaks.primary}
                     options={[
                       { value:'midnight', label:'Midnight' },
                       { value:'scouting', label:'Scouting' },
                       { value:'forest',   label:'Forest'   },
                     ]}
                     onChange={(v) => setTweak('primary', v)} />
        <TweakRadio  label={isEn ? 'Ratio' : '비율'} value={tweaks.aspect}
                     options={[
                       { value:'1:1',  label:'1:1' },
                       { value:'4:5',  label:'4:5' },
                       { value:'9:16', label:'9:16' },
                     ]}
                     onChange={(v) => setTweak('aspect', v)} />
        <TweakToggle label={isEn ? 'Image area' : '이미지 영역'} value={tweaks.showImage}
                     onChange={(v) => setTweak('showImage', v)} />
        <TweakToggle label={isEn ? 'Bg pattern' : '배경 패턴'} value={tweaks.bgPattern}
                     onChange={(v) => setTweak('bgPattern', v)} />
        <TweakSlider label={isEn ? 'Card radius' : '카드 모서리'} value={tweaks.cardRadius ?? 0}
                     min={0} max={40} step={2} unit="px"
                     onChange={(v) => setTweak('cardRadius', v)} />
        <TweakToggle label={isEn ? 'Embed mode' : '임베드 모드'} value={!!tweaks.embed}
                     onChange={(v) => setTweak('embed', v)} />
        <TweakSlider label={isEn ? 'Font scale' : '폰트 크기'} value={tweaks.fontScale}
                     min={0.85} max={1.5} step={0.05} unit="×"
                     onChange={(v) => setTweak('fontScale', v)} />
      </TweakGroup>

      {/* ── 4. 표지 레이아웃 (collapsed by default) ── */}
      <TweakGroup title={isEn ? 'Cover Layout' : '표지 레이아웃'}>
        <TweakSection label={isEn ? 'Padding' : '여백'} />
        <TweakSlider label="위 T"  value={tweaks.covPadT ?? 32} min={0} max={120} step={2} unit="px"
                     onChange={(v) => setTweak('covPadT', v)} />
        <TweakSlider label="오른쪽 R" value={tweaks.covPadR ?? 32} min={0} max={120} step={2} unit="px"
                     onChange={(v) => setTweak('covPadR', v)} />
        <TweakSlider label="아래 B"  value={tweaks.covPadB ?? 32} min={0} max={120} step={2} unit="px"
                     onChange={(v) => setTweak('covPadB', v)} />
        <TweakSlider label="왼쪽 L"  value={tweaks.covPadL ?? 32} min={0} max={120} step={2} unit="px"
                     onChange={(v) => setTweak('covPadL', v)} />
        <TweakRadio  label={isEn ? 'V-align' : '세로 정렬'} value={tweaks.covVAlign ?? 'center'}
                     options={[
                       { value:'top',    label:isEn?'Top':'위' },
                       { value:'center', label:isEn?'Mid':'중앙' },
                       { value:'bottom', label:isEn?'Bot':'아래' },
                     ]}
                     onChange={(v) => setTweak('covVAlign', v)} />

        <TweakSection label={isEn ? 'Item font scale' : '항목별 폰트'} />
        <TweakSlider label={isEn ? 'Eyebrow' : '상단 메타'} value={tweaks.covScaleEyebrow ?? 1} min={0.5} max={2} step={0.05} unit="×"
                     onChange={(v) => setTweak('covScaleEyebrow', v)} />
        <TweakSlider label={isEn ? 'Label' : '라벨 알약'} value={tweaks.covScaleLabel ?? 1} min={0.5} max={2} step={0.05} unit="×"
                     onChange={(v) => setTweak('covScaleLabel', v)} />
        <TweakSlider label={isEn ? 'Title' : '제목'} value={tweaks.covScaleTitle ?? 1} min={0.5} max={2} step={0.05} unit="×"
                     onChange={(v) => setTweak('covScaleTitle', v)} />
        <TweakSlider label={isEn ? 'Subtitle' : '부제'} value={tweaks.covScaleSubtitle ?? 1} min={0.5} max={2} step={0.05} unit="×"
                     onChange={(v) => setTweak('covScaleSubtitle', v)} />
        <TweakSlider label={isEn ? 'Regions' : '지역 칩'} value={tweaks.covScaleRegions ?? 1} min={0.5} max={2} step={0.05} unit="×"
                     onChange={(v) => setTweak('covScaleRegions', v)} />
        <TweakSlider label={isEn ? 'Footer' : '푸터'} value={tweaks.covScaleFooter ?? 1} min={0.5} max={2} step={0.05} unit="×"
                     onChange={(v) => setTweak('covScaleFooter', v)} />

        <TweakSection label={isEn ? 'Item alignment' : '항목별 정렬'} />
        <TweakRadio  label={isEn ? 'Label' : '라벨'}   value={tweaks.covAlignLabel ?? 'left'}
                     options={[{value:'left',label:isEn?'L':'좌'},{value:'center',label:isEn?'C':'중'},{value:'right',label:isEn?'R':'우'}]}
                     onChange={(v) => setTweak('covAlignLabel', v)} />
        <TweakRadio  label={isEn ? 'Title' : '제목'}   value={tweaks.covAlignTitle ?? 'left'}
                     options={[{value:'left',label:isEn?'L':'좌'},{value:'center',label:isEn?'C':'중'},{value:'right',label:isEn?'R':'우'}]}
                     onChange={(v) => setTweak('covAlignTitle', v)} />
        <TweakRadio  label={isEn ? 'Subtitle' : '부제'} value={tweaks.covAlignSubtitle ?? 'left'}
                     options={[{value:'left',label:isEn?'L':'좌'},{value:'center',label:isEn?'C':'중'},{value:'right',label:isEn?'R':'우'}]}
                     onChange={(v) => setTweak('covAlignSubtitle', v)} />
        <TweakRadio  label={isEn ? 'Regions' : '지역 칩'} value={tweaks.covAlignRegions ?? 'left'}
                     options={[{value:'left',label:isEn?'L':'좌'},{value:'center',label:isEn?'C':'중'},{value:'right',label:isEn?'R':'우'}]}
                     onChange={(v) => setTweak('covAlignRegions', v)} />
      </TweakGroup>

      {/* ── 5. 기사 카드 레이아웃 ── */}
      <TweakGroup title={isEn ? 'Article Layout' : '기사 카드 레이아웃'}>
        <TweakSection label={isEn ? 'Padding' : '여백'} />
        <TweakSlider label="위 T"     value={tweaks.artPadT ?? 32} min={0} max={120} step={2} unit="px"
                     onChange={(v) => setTweak('artPadT', v)} />
        <TweakSlider label="오른쪽 R" value={tweaks.artPadR ?? 32} min={0} max={120} step={2} unit="px"
                     onChange={(v) => setTweak('artPadR', v)} />
        <TweakSlider label="아래 B"   value={tweaks.artPadB ?? 32} min={0} max={120} step={2} unit="px"
                     onChange={(v) => setTweak('artPadB', v)} />
        <TweakSlider label="왼쪽 L"   value={tweaks.artPadL ?? 32} min={0} max={120} step={2} unit="px"
                     onChange={(v) => setTweak('artPadL', v)} />

        <TweakSection label={isEn ? 'Item font scale' : '항목별 폰트'} />
        <TweakSlider label={isEn ? 'Rank' : '랭킹 숫자'}  value={tweaks.artScaleRank  ?? 1} min={0.5} max={2} step={0.05} unit="×"
                     onChange={(v) => setTweak('artScaleRank', v)} />
        <TweakSlider label={isEn ? 'Chips + Views' : '칩 + 조회수'} value={tweaks.artScaleChips ?? 1} min={0.5} max={2} step={0.05} unit="×"
                     onChange={(v) => setTweak('artScaleChips', v)} />
        <TweakSlider label={isEn ? 'Title' : '제목'}       value={tweaks.artScaleTitle ?? 1} min={0.5} max={2} step={0.05} unit="×"
                     onChange={(v) => setTweak('artScaleTitle', v)} />
        <TweakSlider label={isEn ? 'Body' : '본문 요약'}  value={tweaks.artScaleBody  ?? 1} min={0.5} max={2} step={0.05} unit="×"
                     onChange={(v) => setTweak('artScaleBody', v)} />
        <TweakSlider label={isEn ? 'Meta' : '하단 메타'}  value={tweaks.artScaleMeta  ?? 1} min={0.5} max={2} step={0.05} unit="×"
                     onChange={(v) => setTweak('artScaleMeta', v)} />
      </TweakGroup>

      {/* ── 6. 엔딩 카드 레이아웃 ── */}
      <TweakGroup title={isEn ? 'Ending Layout' : '엔딩 카드 레이아웃'}>
        <TweakSection label={isEn ? 'Padding' : '여백'} />
        <TweakSlider label="위 T"     value={tweaks.endPadT ?? 48} min={0} max={120} step={2} unit="px"
                     onChange={(v) => setTweak('endPadT', v)} />
        <TweakSlider label="오른쪽 R" value={tweaks.endPadR ?? 32} min={0} max={120} step={2} unit="px"
                     onChange={(v) => setTweak('endPadR', v)} />
        <TweakSlider label="아래 B"   value={tweaks.endPadB ?? 32} min={0} max={120} step={2} unit="px"
                     onChange={(v) => setTweak('endPadB', v)} />
        <TweakSlider label="왼쪽 L"   value={tweaks.endPadL ?? 32} min={0} max={120} step={2} unit="px"
                     onChange={(v) => setTweak('endPadL', v)} />

        <TweakSection label={isEn ? 'Item font scale' : '항목별 폰트'} />
        <TweakSlider label={isEn ? 'Top meta' : '상단 메타'}   value={tweaks.endScaleTop      ?? 1} min={0.5} max={2} step={0.05} unit="×"
                     onChange={(v) => setTweak('endScaleTop', v)} />
        <TweakSlider label={isEn ? 'Title' : '제목'}        value={tweaks.endScaleTitle    ?? 1} min={0.5} max={2} step={0.05} unit="×"
                     onChange={(v) => setTweak('endScaleTitle', v)} />
        <TweakSlider label={isEn ? 'Caption' : '캡션'}        value={tweaks.endScaleCaption  ?? 1} min={0.5} max={2} step={0.05} unit="×"
                     onChange={(v) => setTweak('endScaleCaption', v)} />
        <TweakSlider label={isEn ? 'Contacts' : '연락처'}      value={tweaks.endScaleContacts ?? 1} min={0.5} max={2} step={0.05} unit="×"
                     onChange={(v) => setTweak('endScaleContacts', v)} />
        <TweakSlider label={isEn ? 'Bottom meta' : '하단 메타'}   value={tweaks.endScaleBottom   ?? 1} min={0.5} max={2} step={0.05} unit="×"
                     onChange={(v) => setTweak('endScaleBottom', v)} />
      </TweakGroup>

      {/* ── 7. 엔딩 / 연락처 ── */}
      <TweakGroup title={isEn ? 'Ending / Contacts' : '엔딩 / 연락처'}>
        <TweakText   label={isEn ? 'Ending line 1' : '엔딩 1행'}   value={txVal('endingLine1')}
                     onChange={(v) => setTx('endingLine1', v)} />
        <TweakText   label={isEn ? 'Ending highlight' : '엔딩 강조'}   value={txVal('endingLine2')}
                     onChange={(v) => setTx('endingLine2', v)} />
        <TweakText   label={isEn ? 'Ending suffix' : '엔딩 꼬리'}   value={txVal('endingLine2Suffix')}
                     onChange={(v) => setTx('endingLine2Suffix', v)} />
        <TweakText   label={isEn ? 'Web' : '웹'}             value={txVal('contactWeb')}
                     onChange={(v) => setTx('contactWeb', v)} />
        <TweakText   label={isEn ? 'Instagram' : '인스타'}     value={txVal('contactInsta')}
                     onChange={(v) => setTx('contactInsta', v)} />
        <TweakText   label={isEn ? 'Story tips' : '기사제보'}   value={txVal('contactStory')}
                     onChange={(v) => setTx('contactStory', v)} />
        <TweakText   label={isEn ? 'Inquiries' : '문의'}       value={txVal('contactInfo')}
                     onChange={(v) => setTx('contactInfo', v)} />
      </TweakGroup>
    </TweaksPanel>
  );
}

/* ─────────────── 기사 불러오기 (발행 기사 → 카드 자동 주입) ─────────────── */
const CN_CATEGORIES = [
  { v: '', label: '전체' },
  { v: 'korea', label: '한국' },
  { v: 'apr', label: '아태(APR)' },
  { v: 'wosm', label: '세계(WOSM)' },
  { v: 'people', label: '스카우트 피플' },
];

// 사용자 요청: 자동 태그 안 함 — 불러온 카드는 전부 기본 'WOSM', 직접 보고 수동 변경.
function catToRegion(cat) {
  return 'WOSM';
}

// 발행 기사 → 카드 객체. 본문(400자 발췌)·대표이미지·전체 조회수/좋아요를 가져온다.
// Region 은 category 자동, NSO 연맹명만 수동. 원본 게시글은 불변(postId 참조만).
function articleToCard(a) {
  const dateStr = String(a.publish_at || '').slice(0, 10).replace(/-/g, '.');
  return {
    name: a.title || '',
    nameEn: '',
    region: catToRegion(a.category),  // category 자동 (wosm→WOSM 등)
    nso: '',      // 연맹명 — 수동 입력
    nsoEn: '',
    date: dateStr,
    title: a.title || '',
    titleEn: '',
    summary: a.excerpt || a.subtitle || '',  // 본문 발췌(400자) 우선
    summaryEn: '',
    likes: a.likes || 0,   // 전체 좋아요
    views: a.views || 0,   // 전체 조회수 (카드 표시)
    hint: a.image_caption || (a.author ? ('자료출처: ' + a.author) : ''),
    hintEn: '',
    imgHeight: a.image_url ? 24 : 0,
    imgView: { s: 1, x: 0, y: 0 },  // 이미지 크롭 위치 (더블클릭 reframe 으로 상하 이동)
    image: a.image_url || '',  // 대표이미지만
    postId: a.id,              // 원본 기사 참조 (원본은 불변)
  };
}

// "내용이 비어있는" 카드인지(=새 카드뉴스의 시작용 빈 카드/추가 직후 빈 카드).
// 제목·이름·요약·이미지·NSO 가 모두 비면 placeholder 로 보고 불러오기로 덮어쓴다.
function isBlankCard(a) {
  if (!a) return true;
  const has = (v) => !!(v && String(v).trim());
  return !(has(a.title) || has(a.name) || has(a.summary) || has(a.image) || has(a.nso));
}

// datetime-local 값(YYYY-MM-DDTHH:MM, 사용자 로컬=KST)
function toDtLocal(d) {
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
}
function dtPreset(daysBack) {
  return { start: toDtLocal(new Date(Date.now() - daysBack * 86400000)), end: toDtLocal(new Date()) };
}

// 발행일(YYYY-MM-DD) → 표지값. (연 주차 = ISO, 월중 주차 = ceil(일/7)) admin coverFromDate 와 동일.
const CN_EN_MONTH = ['January','February','March','April','May','June','July','August','September','October','November','December'];
function cnIsoWeek(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dn = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dn + 3);
  const ft = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const fd = (ft.getUTCDay() + 6) % 7;
  ft.setUTCDate(ft.getUTCDate() - fd + 3);
  return 1 + Math.round((date - ft) / (7 * 24 * 3600 * 1000));
}
function coverFromYmd(ymd) {
  const d = new Date(ymd + 'T00:00:00');
  if (isNaN(d.getTime())) return null;
  const y = d.getFullYear(), m = d.getMonth() + 1, day = d.getDate();
  const wom = Math.ceil(day / 7);
  const pad = (x) => String(x).padStart(2, '0');
  return {
    issueDate: y + '.' + pad(m) + '.' + pad(day),
    weekLabel: m + '월 ' + wom + '주차',
    weekLabelEn: 'Week ' + wom + ' · ' + CN_EN_MONTH[m - 1],
    issueNo: y + '년 ' + cnIsoWeek(d) + '주차 BP 미디어 소식',
  };
}

function ArticleImportModal({ open, onClose, tweaks, setTweak, setActive }) {
  const [sort, setSort] = useState('views');
  const [start, setStart] = useState(() => toDtLocal(new Date(Date.now() - 7 * 86400000)));
  const [end, setEnd] = useState(() => toDtLocal(new Date()));
  const [category, setCategory] = useState('');
  const [limit, setLimit] = useState(20);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [picked, setPicked] = useState({}); // {id: true}
  const [syncCover, setSyncCover] = useState(true); // 기간으로 표지(주차/발행번호) 맞추기

  const fetchArticles = useCallback(() => {
    setLoading(true); setError('');
    const qs = new URLSearchParams({ sort: sort, start: start, end: end, category: category, limit: String(limit) });
    fetch('/api/admin/card-news/articles?' + qs.toString(), { credentials: 'same-origin' })
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!ok) throw new Error((j && (j.reason || j.error)) || 'load failed');
        const list = (j && j.items) || [];
        setItems(list);
        // 기본: 상위 6개 자동 선택 ('주간 좋아요 6개' 컨셉)
        const pre = {};
        list.slice(0, 6).forEach((a) => { pre[a.id] = true; });
        setPicked(pre);
      })
      .catch((e) => setError(e && e.message ? e.message : '불러오기 실패'))
      .then(() => setLoading(false));
  }, [sort, start, end, category, limit]);

  useEffect(() => { if (open) fetchArticles(); }, [open]); // 열 때 1회 자동 조회

  if (!open) return null;

  const pickedIds = items.filter((a) => picked[a.id]);
  const toggle = (id) => setPicked((p) => ({ ...p, [id]: !p[id] }));

  const addSelected = () => {
    if (!pickedIds.length) { alert('추가할 기사를 선택하세요.'); return; }
    const cards = pickedIds.map(articleToCard);
    // 비어있는 시작용 카드(빈 페이지)는 버리고 불러온 기사로 채운다 —
    // 새 카드뉴스의 첫 빈 카드를 남겨둔 채 뒤에만 붙는 문제 방지.
    const kept = (tweaks.articles || []).filter((a) => !isBlankCard(a));
    const startIdx = kept.length;          // 불러온 첫 카드가 들어갈 위치
    const next = [...kept, ...cards];
    setTweak('articles', next);
    setTweak('editing', Math.max(0, startIdx)); // 불러온 첫 카드로 이동
    if (typeof setActive === 'function') setActive(startIdx + 1); // 표지(0) 다음이 첫 기사
    // 기간으로 표지(주차 라벨·발행 번호·발행일) 동기화
    if (syncCover) {
      const c = coverFromYmd(String(start).slice(0, 10));
      if (c) {
        setTweak('weekLabel', c.weekLabel);
        setTweak('weekLabelEn', c.weekLabelEn);
        setTweak('issueNo', c.issueNo);
        setTweak('issueDate', c.issueDate);
      }
    }
    onClose();
  };

  const ctrl = { height: 30, padding: '0 8px', borderRadius: 8, border: '1px solid rgba(0,0,0,.15)', background: '#fff', font: 'inherit', fontSize: 13, color: 'var(--color-ink)' };
  const btn = { height: 32, padding: '0 14px', borderRadius: 8, border: '1px solid var(--color-midnight)', background: 'var(--color-midnight)', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' };
  const btnGhost = { ...btn, background: '#fff', color: 'var(--color-ink)', border: '1px solid rgba(0,0,0,.18)' };

  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 2147483647, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: 'min(820px, 96vw)', maxHeight: '90vh', display: 'flex', flexDirection: 'column', background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,.3)', fontFamily: "'Pretendard', system-ui, sans-serif" }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #eee' }}>
          <strong style={{ fontSize: 16, color: 'var(--color-ink)' }}>기사 불러오기</strong>
          <button onClick={onClose} style={{ border: 0, background: 'transparent', fontSize: 20, cursor: 'pointer', color: '#888' }}>×</button>
        </div>

        {/* 조건 */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid #f0f0f0' }}>
          <select value={sort} onChange={(e) => setSort(e.target.value)} style={ctrl} title="정렬 기준">
            <option value="views">조회수 높은순</option>
            <option value="likes">좋아요 많은순</option>
            <option value="recent">최신 발행순</option>
          </select>
          <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} style={{ ...ctrl, width: 178 }} title="시작 (KST)" />
          <span style={{ color: '#999', fontSize: 12 }}>~</span>
          <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} style={{ ...ctrl, width: 178 }} title="종료 (KST)" />
          {[['7일', 7], ['30일', 30], ['90일', 90]].map(([lbl, n]) => (
            <button key={lbl} onClick={() => { const p = dtPreset(n); setStart(p.start); setEnd(p.end); }}
              style={{ ...btnGhost, height: 30, padding: '0 10px', fontSize: 12 }}>{lbl}</button>
          ))}
          <select value={category} onChange={(e) => setCategory(e.target.value)} style={ctrl}>
            {CN_CATEGORIES.map((c) => <option key={c.v} value={c.v}>{c.label}</option>)}
          </select>
          <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} style={ctrl}>
            <option value={10}>10개</option>
            <option value={20}>20개</option>
            <option value={40}>40개</option>
            <option value={60}>60개</option>
          </select>
          <button onClick={fetchArticles} style={btnGhost} disabled={loading}>{loading ? '불러오는 중…' : '조회'}</button>
        </div>

        {/* 목록 */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px', minHeight: 200 }}>
          {error && <div style={{ padding: 20, color: 'var(--color-fire)', fontSize: 13 }}>불러오기 실패: {error}</div>}
          {!error && !loading && !items.length && <div style={{ padding: 30, textAlign: 'center', color: '#999', fontSize: 13 }}>조건에 맞는 기사가 없습니다.</div>}
          {items.map((a) => (
            <label key={a.id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '8px 8px', borderRadius: 10, cursor: 'pointer', background: picked[a.id] ? 'rgba(77,0,110,.06)' : 'transparent' }}>
              <input type="checkbox" checked={!!picked[a.id]} onChange={() => toggle(a.id)} style={{ width: 16, height: 16, flexShrink: 0 }} />
              <div style={{ width: 64, height: 48, flexShrink: 0, borderRadius: 8, overflow: 'hidden', background: '#eee', backgroundImage: a.image_url ? `url("${a.image_url}")` : 'none', backgroundSize: 'cover', backgroundPosition: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#aaa' }}>{a.image_url ? '' : '이미지 없음'}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--color-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title}</div>
                <div style={{ fontSize: 11.5, color: '#999', marginTop: 2 }}>{(a.category || '').toUpperCase()} · ♥ {a.likes} · 👁 {a.views} · {String(a.publish_at).slice(0, 10)}</div>
              </div>
            </label>
          ))}
        </div>

        {/* 액션 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderTop: '1px solid #eee' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--color-ink)', cursor: 'pointer' }}>
              <input type="checkbox" checked={syncCover} onChange={(e) => setSyncCover(e.target.checked)} />
              이 기간으로 표지(주차·발행번호) 맞추기
            </label>
            <span style={{ fontSize: 11.5, color: '#999' }}>{pickedIds.length}개 선택 · 본문 400자·대표이미지·전체 조회수 자동 · 빈 카드는 덮어쓰기 · 태그 기본 WOSM</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={btnGhost}>취소</button>
            <button onClick={addSelected} style={btn} disabled={!pickedIds.length}>선택 {pickedIds.length}개 카드로 추가</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────── 하단 고정 카드 순서 도크 (상시 노출 + 접기) ───────────────
   화면 하단 왼쪽에 고정. 헤더(항상 보임): 접기 토글 + '카드 순서(N장)' + 기사 불러오기.
   펼침: 썸네일 레일에서 기사 카드를 드래그해 순서 변경(표지·엔딩 고정).
   우측에는 Tweaks 패널(width 280, bottom-right)을 위한 여백을 남긴다.            */
function ThumbnailDock({ tweaks, setTweak, active, setActive, collapsed, onToggle, thumbW = 92 }) {
  const total = tweaks.articles.length + 2;
  const aspectW = tweaks.aspect === '4:5' ? 4 : tweaks.aspect === '9:16' ? 9 : 1;
  const aspectH = tweaks.aspect === '4:5' ? 5 : tweaks.aspect === '9:16' ? 16 : 1;
  const scale = thumbW / 1080;

  const [dragArt, setDragArt] = useState(null);
  const [overArt, setOverArt] = useState(null);
  const reorder = (from, to) => {
    if (from == null || to == null || from === to) return;
    const list = [...tweaks.articles];
    if (from < 0 || from >= list.length || to < 0 || to >= list.length) return;
    const [moved] = list.splice(from, 1);
    list.splice(to, 0, moved);
    setTweak('articles', list);
    setTweak('editing', to);
    setActive(to + 1); // 표지(0) 다음이 첫 기사
  };

  const chevron = (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"
      style={{ transition: 'transform .2s', transform: collapsed ? 'rotate(180deg)' : 'none' }}>
      <path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );

  return (
    <div style={{
      position: 'fixed', left: 16, bottom: 16, zIndex: 2147483640,
      width: 'min(1080px, calc(100vw - 344px))',
      maxWidth: 'calc(100vw - 32px)',
      background: 'var(--color-white)',
      border: '1px solid var(--color-gray-300)',
      borderRadius: 14,
      boxShadow: '0 12px 32px -12px color-mix(in oklab, var(--color-ink) 38%, transparent)',
      fontFamily: "'Pretendard', system-ui, sans-serif",
      overflow: 'hidden',
    }}>
      {/* 헤더 — 항상 보임 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 10px 8px 8px',
      }}>
        <button type="button" onClick={onToggle}
          title={collapsed ? '카드 순서 펼치기' : '접기'}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            height: 30, padding: '0 10px', borderRadius: 8,
            border: '1px solid var(--color-gray-300)', background: 'var(--color-white)',
            color: 'var(--color-ink)', cursor: 'pointer', fontWeight: 700, fontSize: 12.5,
          }}>
          {chevron}
          <span>카드 순서</span>
          <span style={{ color: 'var(--color-gray-500)', fontWeight: 600 }}>{tweaks.articles.length}장</span>
        </button>
        {collapsed && (
          <span style={{ fontSize: 11.5, color: 'var(--color-gray-500)' }}>펼쳐서 드래그로 순서 변경</span>
        )}
        <div style={{ flex: 1 }} />
        <button type="button"
          onClick={() => window.dispatchEvent(new CustomEvent('cn-open-import'))}
          title="발행 기사에서 불러오기"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            height: 30, padding: '0 14px', borderRadius: 8,
            border: '1px solid var(--color-midnight)', background: 'var(--color-midnight)',
            color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 12.5,
          }}>
          ⤓ 기사 불러오기
        </button>
      </div>

      {/* 레일 — 펼쳤을 때만 */}
      {!collapsed && (
        <div style={{ padding: '2px 10px 10px' }}>
          <div style={{
            display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 6,
            scrollbarWidth: 'thin',
          }}>
            {Array.from({ length: total }, (_, i) => {
              const isActive = i === active;
              const artIdx = i - 1;
              const isArticle = i >= 1 && i <= total - 2;
              const isDragging = isArticle && dragArt === artIdx;
              const isDropTarget = isArticle && overArt === artIdx && dragArt != null && dragArt !== artIdx;
              return (
                <button key={i} onClick={() => setActive(i)} aria-label={`${i+1}번 카드`}
                  draggable={isArticle}
                  onDragStart={isArticle ? (e) => {
                    setDragArt(artIdx);
                    try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(artIdx)); } catch (_) {}
                  } : undefined}
                  onDragOver={isArticle ? (e) => {
                    if (dragArt == null) return;
                    e.preventDefault();
                    try { e.dataTransfer.dropEffect = 'move'; } catch (_) {}
                    if (overArt !== artIdx) setOverArt(artIdx);
                  } : undefined}
                  onDrop={isArticle ? (e) => {
                    e.preventDefault();
                    reorder(dragArt, artIdx);
                    setDragArt(null); setOverArt(null);
                  } : undefined}
                  onDragEnd={isArticle ? () => { setDragArt(null); setOverArt(null); } : undefined}
                  style={{
                    flex: '0 0 auto',
                    width: thumbW, aspectRatio: `${aspectW} / ${aspectH}`,
                    borderRadius: 10, overflow: 'hidden',
                    padding: 0, border: 'none',
                    cursor: isArticle ? 'grab' : 'pointer',
                    outline: isDropTarget
                      ? '2px dashed var(--color-ocean)'
                      : isActive ? '2px solid var(--color-midnight)' : '1px solid var(--color-gray-300)',
                    outlineOffset: (isActive || isDropTarget) ? 2 : 0,
                    background: 'var(--color-white)',
                    boxShadow: isActive
                      ? '0 10px 20px -12px color-mix(in oklab, var(--color-midnight) 40%, transparent)'
                      : 'none',
                    transform: isActive ? 'translateY(-2px)' : 'none',
                    opacity: isDragging ? .45 : 1,
                    transition: 'transform .2s, box-shadow .2s, outline-color .2s, opacity .15s',
                    position: 'relative',
                  }}>
                  <div style={{
                    position: 'absolute', inset: 0,
                    transform: `scale(${scale})`, transformOrigin: 'top left',
                    width: 1080, height: 1080, pointerEvents: 'none',
                  }}>
                    <CardForIndex i={i} total={total} tweaks={tweaks} />
                  </div>
                  <div style={{
                    position: 'absolute', left: 5, bottom: 4,
                    fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                    fontSize: 9.5, fontWeight: 700,
                    padding: '1px 5px', borderRadius: 4,
                    background: 'color-mix(in oklab, white 85%, transparent)',
                    color: 'var(--color-ink)',
                  }}>{String(i+1).padStart(2,'0')}</div>
                </button>
              );
            })}
          </div>
          <div style={{
            marginTop: 2, fontFamily: '"JetBrains Mono", ui-monospace, monospace',
            fontSize: 10.5, letterSpacing: '.04em', color: 'var(--color-gray-500)',
          }}>↔ 기사 카드를 드래그해 순서 변경 · 표지·엔딩은 고정</div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── App root ─────────────────────────── */
function App() {
  const [t, setTweak] = useTweaks(window.TWEAK_DEFAULTS);
  const [active, setActive] = useState(0);
  const [importOpen, setImportOpen] = useState(false);
  // 하단 카드 순서 도크 접힘 상태 (localStorage 로 유지).
  const [railCollapsed, setRailCollapsed] = useState(() => {
    try { return localStorage.getItem('cn.railCollapsed') === '1'; } catch (_) { return false; }
  });
  const toggleRail = useCallback(() => {
    setRailCollapsed((c) => {
      const next = !c;
      try { localStorage.setItem('cn.railCollapsed', next ? '1' : '0'); } catch (_) {}
      return next;
    });
  }, []);

  /* Embed mode — for porting into the homepage via <iframe ?embed=1>.
     Strips the preview chrome (header, export buttons, thumbnail rail,
     counter) and the page background/padding so only the clean carousel
     shows, ready to drop into a page section. Can also be forced via the
     `embed` tweak. */
  const params = new URLSearchParams(window.location.search);
  const embed = params.get('embed') === '1' || params.get('embed') === 'true' || !!t.embed;

  /* Card corner radius is now a tweak (default 0 = square, full-bleed —
     no rounded corners on the card edges). Applied by overriding the
     --radius-card token at the page scope so every CardFrame picks it up. */
  const cardRadius = (t.cardRadius ?? 0) + 'px';

  useEffect(() => {
    document.body.classList.toggle('is-embed', embed);
    return () => document.body.classList.remove('is-embed');
  }, [embed]);

  // Tweaks 패널의 '기사 불러오기' 버튼이 보내는 이벤트로도 모달을 연다(발견성).
  useEffect(() => {
    const h = () => setImportOpen(true);
    window.addEventListener('cn-open-import', h);
    return () => window.removeEventListener('cn-open-import', h);
  }, []);

  /* 이미지 reframe(더블클릭 후 드래그) 결과를 article.imgView 에 영속화.
     <image-slot> 이 'imageslotcommit' 을 bubbles+composed 로 올려주고, 여기서
     id(article-<rank>)로 해당 기사를 찾아 위치를 저장한다 → '서버 저장' 시 D1 반영.
     tRef 로 최신 tweaks 를 참조해 stale-closure 를 피한다. */
  const tRef = React.useRef(t);
  tRef.current = t;

  // 캐러셀 가운데 카드 ↔ Tweaks '기사 편집' 양방향 동기화. 좌우 화살표·키보드·썸네일·
  // 도트로 가운데 카드를 옮기면 Tweaks 편집 대상도 그 기사로 따라간다(기사 카드일 때).
  // 표지(0)/엔딩(total-1)에선 마지막 기사 편집 컨텍스트를 유지한다.
  useEffect(() => {
    const arts = (tRef.current && tRef.current.articles) || [];
    const totalCards = arts.length + 2;
    if (active >= 1 && active <= totalCards - 2) {
      const idx = active - 1;
      if ((tRef.current.editing ?? 0) !== idx) setTweak('editing', idx);
    }
  }, [active, setTweak]);

  useEffect(() => {
    const onCommit = (e) => {
      const d = (e && e.detail) || {};
      const m = String(d.id || '').match(/^article-(\d+)$/);
      if (!m) return;
      const idx = parseInt(m[1], 10) - 1; // rank(1-based) → articles index
      const arts = (tRef.current && tRef.current.articles) || [];
      if (idx < 0 || idx >= arts.length) return;
      const v = d.view || { s: 1, x: 0, y: 0 };
      const cur = arts[idx].imgView || {};
      if (cur.s === v.s && cur.x === v.x && cur.y === v.y) return; // 변화 없으면 skip
      setTweak('articles', arts.map((a, i) => i === idx ? { ...a, imgView: v } : a));
    };
    window.addEventListener('imageslotcommit', onCommit);
    return () => window.removeEventListener('imageslotcommit', onCommit);
  }, [setTweak]);

  // 하단 고정 도크가 가리지 않도록 페이지 하단 여백 확보(접힘/펼침·비율에 맞춰).
  const dockAspectW = t.aspect === '4:5' ? 4 : t.aspect === '9:16' ? 9 : 1;
  const dockAspectH = t.aspect === '4:5' ? 5 : t.aspect === '9:16' ? 16 : 1;
  const dockThumbH = Math.round(92 * dockAspectH / dockAspectW);
  const dockReserve = embed ? undefined : (railCollapsed ? 84 : (dockThumbH + 120));

  return (
    <div className="page" style={{ '--radius-card': cardRadius, paddingBottom: dockReserve }}>
      {!embed && <PageHeader tweaks={t} active={active} setActive={setActive}/>}
      <Carousel tweaks={t} active={active} setActive={setActive} embed={embed}/>
      <TweaksUI tweaks={t} setTweak={setTweak} active={active} setActive={setActive}/>
      {!embed && (
        <ThumbnailDock tweaks={t} setTweak={setTweak} active={active} setActive={setActive}
          collapsed={railCollapsed} onToggle={toggleRail}/>
      )}
      <ArticleImportModal open={importOpen} onClose={() => setImportOpen(false)} tweaks={t} setTweak={setTweak} setActive={setActive}/>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
