/* ============================================================
   DreamPath Document Templates — app (vanilla)
   marks · star classification · nav · scaling · print · export hooks
   ============================================================ */
(function(){
  var markTpl = document.getElementById('markTpl');
  var starTpl = document.getElementById('starTpl');

  // inject logo marks
  document.querySelectorAll('.mk').forEach(function(slot){ slot.appendChild(markTpl.content.cloneNode(true)); });

  // importance labels
  var IMP = {
    standard:  { l:'Standard',  s:'Routine' },
    important: { l:'Important', s:'Confidential' },
    priority:  { l:'Priority',  s:'Action required' }
  };

  // inject classification chips
  document.querySelectorAll('.chip-slot').forEach(function(slot){
    var chip = document.createElement('div');
    chip.className = 'classchip';
    chip.innerHTML = '<span class="lvl-badge"></span><span class="cl"><span class="cl-l"></span><span class="cl-s"></span></span>';
    slot.appendChild(chip);
  });

  // standalone stars (guide level chips, etc.)
  document.querySelectorAll('.star').forEach(function(s){ if(!s.querySelector('svg')) s.appendChild(starTpl.content.cloneNode(true)); });

  // record a document number in the header of each numbered document
  var DOCNO={ letterhead:'DP-2026-0142', press:'DP-PR-2026-014', general:'DP-DOC-2026-001', weekly:'DP-WR-2026-024', brief:'DP-BRF-2026-007', minutes:'DP-MIN-2026-014' };
  Object.keys(DOCNO).forEach(function(tg){
    var hr=document.querySelector('.frame[data-target="'+tg+'"] .head-r');
    if(hr && !hr.querySelector('.docref')){ var d=document.createElement('div'); d.className='docref'; d.innerHTML='No. <b contenteditable="true">'+DOCNO[tg]+'</b>'; var chip=hr.querySelector('.chip-slot'); if(chip) hr.insertBefore(d, chip); else hr.appendChild(d); }
  });

  // wrap footer content + inject centered page numbers (paper documents)
  document.querySelectorAll('.doc-foot').forEach(function(f){
    if(!f.querySelector('.foot-main')){
      var fl=f.querySelector('.fl'), fr=f.querySelector('.fr');
      var main=document.createElement('div'); main.className='foot-main';
      if(fl) main.appendChild(fl);
      if(fr) main.appendChild(fr);
      f.insertBefore(main, f.firstChild);
    }
    if(!f.querySelector('.pageno')){
      var p=document.createElement('span'); p.className='pageno'; p.setAttribute('contenteditable','true'); p.textContent='Page 1 of 1';
      f.appendChild(p);
    }
  });

  var STAGE = { standard:1, important:2, priority:3 };
  function starEl(){ var s=document.createElement('span'); s.className='star'; s.appendChild(starTpl.content.cloneNode(true)); return s; }
  function updateChips(){
    var imp = document.body.getAttribute('data-importance') || 'standard';
    var m = IMP[imp] || IMP.standard;
    var n = STAGE[imp] || 1;
    document.querySelectorAll('.classchip').forEach(function(chip){
      var badge = chip.querySelector('.lvl-badge'); if(badge){ badge.innerHTML=''; for(var i=0;i<n;i++) badge.appendChild(starEl()); }
      var l=chip.querySelector('.cl-l'); if(l) l.textContent=m.l;
      var s=chip.querySelector('.cl-s'); if(s) s.textContent=m.s;
    });
  }
  updateChips();

  // ---- nav + scaling ----
  var stage = document.getElementById('stage');
  var frames = [].slice.call(document.querySelectorAll('.frame'));
  var btns = [].slice.call(document.querySelectorAll('.rail-btn'));
  var pagesize = document.getElementById('pagesize');
  var copyBtn = document.getElementById('copyBtn');

  var PAGE = {
    portrait:'@page{size:210mm 297mm;margin:0;}',
    landscape:'@page{size:297mm 210mm;margin:0;}',
    card:'@page{size:90mm 50mm;margin:0;}'
  };
  var ENVMM = { dl:'220mm 110mm', c5:'229mm 162mm', c4:'324mm 229mm' };
  var ENVCAP = { dl:'DL · 220 × 110 mm', c5:'C5 · 229 × 162 mm', c4:'C4 · 324 × 229 mm' };
  function envSizeNow(){ var d=document.getElementById('envDoc'); return d? (d.classList.contains('c4')?'c4':d.classList.contains('c5')?'c5':'dl') : 'dl'; }
  function pageRule(orient){
    if(orient==='envelope') return '@page{size:'+ENVMM[envSizeNow()]+';margin:0;}';
    return PAGE[orient] || PAGE.portrait;
  }
  function activeFrame(){ return document.querySelector('.frame.on'); }
  function activeTarget(){ var f=activeFrame(); return f?f.getAttribute('data-target'):'letterhead'; }

  function fit(){
    var fr = activeFrame(); if(!fr) return;
    var avail = Math.max(320, window.innerWidth - 248 - 80);
    var boxes = fr.querySelectorAll('.docbox');
    var perRow = (fr.getAttribute('data-target')==='card') ? 2 : 1;
    boxes.forEach(function(box){
      var doc = box.querySelector('.doc');
      doc.style.transform = 'none';
      var w = doc.offsetWidth, h = doc.offsetHeight;
      var room = perRow > 1 ? (avail - 28*(perRow-1)) / perRow : avail;
      var s = Math.min(1, room / w);
      box.style.width = (w*s)+'px'; box.style.height = (h*s)+'px';
      doc.style.transformOrigin = 'top left'; doc.style.transform = 'scale('+s+')';
    });
  }

  function select(target){
    frames.forEach(function(f){ f.classList.toggle('on', f.getAttribute('data-target')===target); });
    btns.forEach(function(b){ b.classList.toggle('on', b.getAttribute('data-target')===target); });
    var fr = activeFrame();
    var orient = fr ? fr.getAttribute('data-orient') : 'portrait';
    pagesize.textContent = pageRule(orient);
    copyBtn.style.display = (target==='sig') ? 'inline-flex' : 'none';
    if(location.hash.slice(1)!==target){ history.replaceState(null,'','#'+target); }
    window.DPState = { target: target };
    window.dispatchEvent(new CustomEvent('tplchange', { detail: target }));
    fit();
  }
  btns.forEach(function(b){ b.addEventListener('click', function(){ select(b.getAttribute('data-target')); }); });

  // ---- print (PDF) ----
  document.getElementById('pdfBtn').addEventListener('click', function(){ window.print(); });

  // ---- Word export ----
  document.getElementById('wordBtn').addEventListener('click', function(){
    if(window.DPExport){ window.DPExport.toWord(activeTarget()); }
  });

  // ---- copy email signature ----
  copyBtn.addEventListener('click', function(){
    var card = document.getElementById('sigCard');
    var html = buildSigHTML(card);
    var blob = new Blob([html], {type:'text/html'});
    if(navigator.clipboard && window.ClipboardItem){
      navigator.clipboard.write([new ClipboardItem({'text/html':blob,'text/plain':new Blob([card.innerText],{type:'text/plain'})})])
        .then(showToast).catch(function(){ legacyCopy(html); });
    } else { legacyCopy(html); }
  });
  function legacyCopy(html){
    var d=document.createElement('div'); d.contentEditable='true'; d.innerHTML=html;
    d.style.position='fixed'; d.style.left='-9999px'; document.body.appendChild(d);
    var r=document.createRange(); r.selectNodeContents(d); var s=getSelection(); s.removeAllRanges(); s.addRange(r);
    try{ document.execCommand('copy'); showToast(); }catch(e){}
    s.removeAllRanges(); document.body.removeChild(d);
  }
  function showToast(msg){ var t=document.getElementById('toast'); if(msg) t.textContent=msg; t.classList.add('show'); setTimeout(function(){ t.classList.remove('show'); },1600); }
  window.DPToast = showToast;

  function buildSigHTML(card){
    var q=function(s){var e=card.querySelector(s);return e?e.innerHTML:'';};
    var nm=q('.nm'), ti=q('.ti'), l1=q('.sg-info .ln:nth-of-type(1)');
    return ''+
'<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-family:Helvetica,Arial,sans-serif;color:#1F1F1F">'+
'<tr><td style="border-left:3px solid #6B2DBE;padding-left:14px;vertical-align:middle">'+
'<div style="font-size:16px;font-weight:700;letter-spacing:-0.2px">'+nm+'</div>'+
'<div style="font-size:11px;color:#8A8A93;padding:2px 0 7px">'+ti+'</div>'+
'<div style="font-size:11px;color:#55555c;line-height:1.7">'+l1+'</div>'+
'<div style="font-size:11px;line-height:1.7"><a href="https://koreadreampath.com" style="color:#6B2DBE;text-decoration:none;font-weight:600">koreadreampath.com</a></div>'+
'</td></tr></table>';
  }

  // ---- tweaks application (called by the React tweaks island) ----
  function setPill(el, color, text, marker){
    if(!el) return;
    el.className = 'pill ' + color + (marker ? ' ' + marker : '');
    el.innerHTML = '<span class="dot"></span>' + text;
  }
  var WK = { ontrack:['green','On track'], atrisk:['amber','At risk'], delayed:['red','Delayed'] };
  var BF = { inprogress:['blue','In progress'], planned:['gray','Planned'], complete:['green','Complete'] };
  var GN = { draft:['gray','Draft'], inreview:['blue','In review'], reviewed:['green','Reviewed'], approved:['green','Approved'] };
  var CT = { completion:'Completion', participation:'Participation', achievement:'Achievement' };
  var DEC = { approved:0, conditional:1, rejected:2 };

  // ---- multi-page (1 page / 2 pages) ----
  function activePaper(){ var f=activeFrame(); var tg=f&&f.getAttribute('data-target'); return (['letterhead','press','weekly','brief','minutes','general'].indexOf(tg)>=0)?f:null; }
  function setPages(n){
    document.querySelectorAll('.docbox.cont').forEach(function(c){ c.remove(); });
    document.querySelectorAll('.frame:not([data-target="guide"]) .doc-foot .pageno').forEach(function(p){ p.textContent='Page 1 of 1'; });
    if(n!=='2'){ fit(); return; }
    var fr=activePaper(); if(!fr){ fit(); return; }
    var firstBox=fr.querySelector('.docbox'); var firstDoc=firstBox.querySelector('.doc');
    var p1=firstDoc.querySelector('.doc-foot .pageno'); if(p1) p1.textContent='Page 1 of 2';
    var head=firstDoc.querySelector('.lh-head').cloneNode(true);
    var fl=firstDoc.querySelector('.doc-foot .fl').cloneNode(true);
    var cont=document.createElement('div'); cont.className='docbox cont';
    cont.innerHTML='<div class="doc a4p"><div class="pad"></div>'+
      '<div class="doc-foot"><div class="foot-main"></div><span class="pageno" contenteditable="true">Page 2 of 2</span><div class="fr" contenteditable="true">koreadreampath.com</div></div></div>';
    var pad=cont.querySelector('.pad');
    pad.appendChild(head);
    var ti=document.createElement('div'); ti.className='dtitle'; ti.innerHTML='<p class="kick">Continued</p>'; pad.appendChild(ti);
    var body=document.createElement('div'); body.className='letter-body'; body.style.marginTop='18px';
    body.innerHTML='<p class="body" contenteditable="true">…continued from page 1. Type or paste additional content here — it flows onto this second page.</p><p class="body" contenteditable="true">Add further paragraphs, tables, or a sign-off as needed.</p>';
    pad.appendChild(body);
    var main=cont.querySelector('.foot-main'); var frEl=cont.querySelector('.doc-foot > .fr');
    main.appendChild(fl); main.appendChild(frEl);
    firstBox.parentNode.appendChild(cont);
    fit();
  }

  window.applyTweaks = function(t){
    if(!t) return;
    var b = document.body;
    // global
    if(t.importance) b.setAttribute('data-importance', t.importance);
    if(t.density) b.setAttribute('data-density', t.density);
    if(t.paper) b.setAttribute('data-paper', t.paper);
    if(t.showStar!==undefined) b.classList.toggle('hide-star', t.showStar===false);
    if(t.showFooter!==undefined) b.classList.toggle('hide-foot', t.showFooter===false);
    updateChips();
    if(t.pages!==undefined) setPages(t.pages);

    // per-document options
    var dv=document.querySelector('.deliv-v'); if(dv && t.letterDelivery) dv.textContent=t.letterDelivery;

    var pf=document.querySelector('.pr-flag');
    if(pf && t.pressRelease){ pf.textContent = (t.pressRelease==='embargo') ? ('Embargoed until '+(t.embargoDate||'[date]')) : 'For immediate release'; }

    if(t.weeklyStatus && WK[t.weeklyStatus]) setPill(document.querySelector('.wk-overall'), WK[t.weeklyStatus][0], WK[t.weeklyStatus][1], 'wk-overall');
    if(t.briefStatus && BF[t.briefStatus]) setPill(document.querySelector('.bf-status'), BF[t.briefStatus][0], BF[t.briefStatus][1], 'bf-status');
    if(t.generalStatus && GN[t.generalStatus]) setPill(document.querySelector('.gn-status'), GN[t.generalStatus][0], GN[t.generalStatus][1], 'gn-status');

    var sr=document.getElementById('apprDecision');
    if(sr && t.approvalDecision!==undefined){
      var pills=sr.querySelectorAll('.pill');
      pills.forEach(function(p){ p.classList.remove('sel'); });
      if(t.approvalDecision && t.approvalDecision!=='pending'){ sr.classList.add('has-sel'); var i=DEC[t.approvalDecision]; if(pills[i]) pills[i].classList.add('sel'); }
      else sr.classList.remove('has-sel');
    }

    var ms=document.getElementById('minsStamp');
    if(ms && t.minutesStatus!==undefined){
      if(!t.minutesStatus || t.minutesStatus==='none'){ ms.style.display='none'; }
      else { ms.style.display='inline-flex'; ms.textContent = t.minutesStatus==='approved'?'Approved':'Draft'; ms.classList.toggle('approved', t.minutesStatus==='approved'); }
    }

    if(t.coverType) document.querySelectorAll('.cover-mid .typ').forEach(function(e){ e.textContent=t.coverType; });
    if(t.coverConfidential!==undefined) document.querySelectorAll('.cover-head-r .ck').forEach(function(e){ e.style.display = t.coverConfidential===false ? 'none' : ''; });

    var ck=document.getElementById('certKind'); if(ck && t.certType) ck.textContent='Certificate of '+(CT[t.certType]||'Completion');
    if(t.certSeal!==undefined) b.classList.toggle('hide-seal', t.certSeal===false);

    var et=document.getElementById('envTo'); if(et && t.envWindow!==undefined) et.classList.toggle('win', t.envWindow===true);
    if(t.envSize){
      var ed=document.getElementById('envDoc');
      if(ed && !ed.classList.contains(t.envSize)){
        ed.classList.remove('dl','c5','c4'); ed.classList.add(t.envSize);
        var cap=document.getElementById('envCap'); if(cap) cap.textContent=ENVCAP[t.envSize];
        if(activeTarget()==='envelope'){ pagesize.textContent=pageRule('envelope'); fit(); }
      }
    }
  };

  window.addEventListener('resize', fit);

  // init
  var initial = location.hash.slice(1);
  var valid = btns.some(function(b){ return b.getAttribute('data-target')===initial; });
  select(valid ? initial : 'guide');
  if(document.fonts && document.fonts.ready){ document.fonts.ready.then(fit); }
  setTimeout(fit, 350);
})();
