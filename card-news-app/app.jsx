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

      {/* Thumbnails */}
      {!embed && (
      <div style={{
        marginTop:'var(--gap-section)',
        display:'flex', gap:'var(--gap-element)',
        overflowX:'auto', paddingBottom: 'var(--gap-element)',
        scrollbarWidth:'thin',
      }}>
        {Array.from({ length: total }, (_, i) => {
          const isActive = i === active;
          return (
            <button key={i} onClick={() => setActive(i)} aria-label={`${i+1}번 카드`} style={{
              flex:'0 0 auto',
              width: 96, aspectRatio:`${aspectW} / ${aspectH}`,
              borderRadius: 'var(--radius-element)',
              overflow:'hidden',
              padding: 0, border:'none', cursor:'pointer',
              outline: isActive ? '2px solid var(--color-midnight)' : '1px solid var(--color-gray-300)',
              outlineOffset: isActive ? 2 : 0,
              background:'var(--color-white)',
              boxShadow: isActive
                ? '0 12px 24px -12px color-mix(in oklab, var(--color-midnight) 40%, transparent)'
                : 'none',
              transform: isActive ? 'translateY(-2px)' : 'none',
              transition: 'transform .2s, box-shadow .2s, outline-color .2s',
              position:'relative',
            }}>
              <div style={{
                position:'absolute', inset:0,
                transform:'scale(.0889)',
                transformOrigin:'top left',
                width: 1080, height: 1080,
                pointerEvents:'none',
              }}>
                <CardForIndex i={i} total={total} tweaks={tweaks} />
              </div>
              <div style={{
                position:'absolute', left: 6, bottom: 5,
                fontFamily:'"JetBrains Mono", ui-monospace, monospace',
                fontSize: 10, fontWeight: 700,
                padding:'2px 6px', borderRadius: 4,
                background:'color-mix(in oklab, white 85%, transparent)',
                color:'var(--color-ink)',
              }}>{String(i+1).padStart(2,'0')}</div>
            </button>
          );
        })}
      </div>
      )}

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
  const article = tweaks.articles[articleIdx];
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
      likes: 0,
      hint: '', hintEn: '',
      imgHeight: 22,
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
        <TweakNumber label={isEn ? 'Views' : '조회수'}     value={article.likes} min={0} step={1}
                     onChange={(v) => setArticleField('likes', v)} />
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

// 발행 기사 → 카드 객체. 대표이미지만 사용. NSO/Region 은 비워 수동 입력.
function articleToCard(a) {
  const dateStr = String(a.publish_at || '').slice(0, 10).replace(/-/g, '.');
  return {
    name: a.title || '',
    nameEn: '',
    region: '',   // 수동 입력
    nso: '',      // 수동 입력
    nsoEn: '',
    date: dateStr,
    title: a.title || '',
    titleEn: '',
    summary: a.subtitle || a.excerpt || '',
    summaryEn: '',
    likes: a.likes || 0,
    hint: a.image_caption || (a.author ? ('자료출처: ' + a.author) : ''),
    hintEn: '',
    imgHeight: a.image_url ? 24 : 0,
    image: a.image_url || '',  // 대표이미지만
    postId: a.id,              // 원본 기사 참조 (원본은 불변)
  };
}

function ArticleImportModal({ open, onClose, tweaks, setTweak }) {
  const [sort, setSort] = useState('likes');
  const [days, setDays] = useState(7);
  const [category, setCategory] = useState('');
  const [limit, setLimit] = useState(20);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [picked, setPicked] = useState({}); // {id: true}

  const fetchArticles = useCallback(() => {
    setLoading(true); setError('');
    const qs = new URLSearchParams({ sort: sort, days: String(days), category: category, limit: String(limit) });
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
  }, [sort, days, category, limit]);

  useEffect(() => { if (open) fetchArticles(); }, [open]); // 열 때 1회 자동 조회

  if (!open) return null;

  const pickedIds = items.filter((a) => picked[a.id]);
  const toggle = (id) => setPicked((p) => ({ ...p, [id]: !p[id] }));

  const addSelected = () => {
    if (!pickedIds.length) { alert('추가할 기사를 선택하세요.'); return; }
    const cards = pickedIds.map(articleToCard);
    const next = [...(tweaks.articles || []), ...cards];
    setTweak('articles', next);
    setTweak('editing', Math.max(0, next.length - cards.length)); // 첫 추가 카드로 이동
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
          <select value={sort} onChange={(e) => setSort(e.target.value)} style={ctrl}>
            <option value="likes">좋아요순</option>
            <option value="recent">최신순</option>
            <option value="views">조회순</option>
          </select>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} style={ctrl}>
            <option value={7}>최근 7일</option>
            <option value={14}>최근 14일</option>
            <option value={30}>최근 30일</option>
            <option value={90}>최근 90일</option>
            <option value={0}>전체 기간</option>
          </select>
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
          <span style={{ fontSize: 12.5, color: '#777' }}>{pickedIds.length}개 선택 · 대표이미지만 가져옵니다 · NSO·Region 은 카드에서 직접 입력</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={btnGhost}>취소</button>
            <button onClick={addSelected} style={btn} disabled={!pickedIds.length}>선택 {pickedIds.length}개 카드로 추가</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── App root ─────────────────────────── */
function App() {
  const [t, setTweak] = useTweaks(window.TWEAK_DEFAULTS);
  const [active, setActive] = useState(0);
  const [importOpen, setImportOpen] = useState(false);

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

  return (
    <div className="page" style={{ '--radius-card': cardRadius }}>
      {!embed && <PageHeader tweaks={t} active={active} setActive={setActive}/>}
      {!embed && (
        <button type="button" onClick={() => setImportOpen(true)}
          style={{ position: 'fixed', left: 16, bottom: 16, zIndex: 2147483646,
            height: 40, padding: '0 18px', borderRadius: 999,
            border: '1px solid var(--color-midnight)', background: 'var(--color-midnight)', color: '#fff',
            fontWeight: 700, fontSize: 13.5, cursor: 'pointer', boxShadow: '0 6px 20px rgba(0,0,0,.22)',
            fontFamily: "'Pretendard', system-ui, sans-serif" }}>
          + 기사 불러오기
        </button>
      )}
      <Carousel tweaks={t} active={active} setActive={setActive} embed={embed}/>
      <TweaksUI tweaks={t} setTweak={setTweak} active={active} setActive={setActive}/>
      <ArticleImportModal open={importOpen} onClose={() => setImportOpen(false)} tweaks={t} setTweak={setTweak}/>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
