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

  // record an automatically generated document number in each numbered header
  // Rule: DP-DOC-YYYYMMDD-{author initial}{2 random letters}{4 random digits}
  var DOC_TARGETS=['letterhead','press','general','weekly','brief','minutes'];
  function rand(max){
    if(window.crypto && crypto.getRandomValues){
      var a=new Uint32Array(1); crypto.getRandomValues(a); return a[0] % max;
    }
    return Math.floor(Math.random()*max);
  }
  var ABC='ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  function letters(n){ var out=''; for(var i=0;i<n;i++) out+=ABC.charAt(rand(26)); return out; }
  function digits(n){ var out=''; for(var i=0;i<n;i++) out+=String(rand(10)); return out; }
  function ymd(){ var d=new Date(), p=function(x){return (x<10?'0':'')+x;}; return ''+d.getFullYear()+p(d.getMonth()+1)+p(d.getDate()); }
  // First character of the document author's name. The parent app sets
  // window.__DP_AUTHOR_INITIAL after the frame loads; until then (or when
  // unknown) we fall back to a random letter so the number is still valid.
  function authorChar(){
    var a=(window.__DP_AUTHOR_INITIAL||'').toString().trim();
    if(a) return a.charAt(0).toUpperCase();
    return ABC.charAt(rand(26));
  }
  function docNo(){
    var used={};
    try{ used=JSON.parse(localStorage.getItem('dp_template_doc_numbers')||'{}')||{}; }catch(e){}
    var no, guard=0;
    do { no='DP-DOC-'+ymd()+'-'+authorChar()+letters(2)+digits(4); } while(used[no] && ++guard<50);
    used[no]=Date.now();
    try{ localStorage.setItem('dp_template_doc_numbers', JSON.stringify(used)); }catch(e){}
    return no;
  }
  function assignDocNumbers(){
    DOC_TARGETS.forEach(function(tg){
      var slot=document.querySelector('.frame[data-target="'+tg+'"] .docref b');
      if(slot) {
        slot.textContent=docNo();
        var ref=document.querySelector('.frame[data-target="'+tg+'"] .r .label');
        if(ref && /our ref/i.test(ref.textContent||'')){
          var v=ref.parentNode.querySelector('.v');
          if(v) v.textContent=slot.textContent;
        }
      }
    });
  }
  DOC_TARGETS.forEach(function(tg){
    var hr=document.querySelector('.frame[data-target="'+tg+'"] .head-r');
    if(hr && !hr.querySelector('.docref')){ var d=document.createElement('div'); d.className='docref'; d.innerHTML='No. <b contenteditable="true">'+docNo()+'</b>'; var chip=hr.querySelector('.chip-slot'); if(chip) hr.insertBefore(d, chip); else hr.appendChild(d); }
  });
  assignDocNumbers();
  window.DPTemplateNewDocNumbers = assignDocNumbers;

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

  // ---- auto continuation pages ----
  function activePaper(){ var f=activeFrame(); var tg=f&&f.getAttribute('data-target'); return (['letterhead','press','weekly','brief','minutes','general'].indexOf(tg)>=0)?f:null; }
  function makeContinuationPage(fr, number){
    var firstDoc=fr.querySelector('.docbox .doc');
    if(!firstDoc) return null;
    var head=firstDoc.querySelector('.lh-head');
    var fl=firstDoc.querySelector('.doc-foot .fl');
    var cont=document.createElement('div'); cont.className='docbox cont';
    cont.setAttribute('data-auto-page', String(number || 2));
    cont.innerHTML='<div class="doc a4p"><div class="pad"></div>'+
      '<div class="doc-foot"><div class="foot-main"></div><span class="pageno">Page '+(number||2)+'</span><div class="fr">koreadreampath.com</div></div></div>';
    var pad=cont.querySelector('.pad');
    if(head) pad.appendChild(head.cloneNode(true));
    var ti=document.createElement('div'); ti.className='dtitle'; ti.innerHTML='<p class="kick">Continued</p>'; pad.appendChild(ti);
    var body=document.createElement('div'); body.className='letter-body'; body.style.marginTop='18px';
    body.innerHTML='<p class="body" contenteditable="true" data-auto-flow-anchor="1"></p>';
    pad.appendChild(body);
    var main=cont.querySelector('.foot-main'); var frEl=cont.querySelector('.doc-foot > .fr');
    if(fl) main.appendChild(fl.cloneNode(true));
    main.appendChild(frEl);
    return cont;
  }
  function pageBody(box){
    if(!box) return null;
    return box.querySelector('.letter-body') || box.querySelector('.pad');
  }
  function firstFlowNodes(box){
    var pad=box && box.querySelector('.pad');
    if(!pad) return [];
    var lb=pad.querySelector('.letter-body');
    if(lb) return [].slice.call(lb.children).filter(flowNodeFilter);
    return [].slice.call(pad.children).filter(function(n){
      return n.matches && n.matches('.sec, .body, .body-list, h3');
    });
  }
  function contFlowNodes(box){
    var body=pageBody(box);
    if(!body) return [];
    return [].slice.call(body.children).filter(flowNodeFilter);
  }
  function flowNodeFilter(n){
    return !(n && n.hasAttribute && n.hasAttribute('data-auto-flow-anchor') && !String(n.textContent||'').trim());
  }
  function collectFlowNodes(fr){
    var boxes=[].slice.call(fr.querySelectorAll('.docbox'));
    var out=[];
    boxes.forEach(function(box,i){
      out=out.concat(i===0 ? firstFlowNodes(box) : contFlowNodes(box));
    });
    return out;
  }
  // Generate / fetch a stable id used to reunite a split tail with its source.
  var __splitSeq=0;
  function splitSrcId(node){
    var id=node.getAttribute('data-split-src');
    if(!id){ id='s'+(++__splitSeq); node.setAttribute('data-split-src', id); }
    return id;
  }
  // [CASE STUDY 2026-06-09 — order-preserving reflow]
  // 증상(초판): 본문 tail 이 다른 문단(enclosure)에 잘못 병합 + 페이지 폭주(15·398장).
  // 원인: 트레일링 노드를 먼저 다음 장으로 옮겨 순서가 깨지고, 인접 기반 머지가 오작동.
  // 교훈: tail 은 source-id(data-split-of↔data-split-src)로 재결합하고, 분할은
  //       "넘치는 첫 노드 + 그 이후 전부"를 통째로 다음 장으로 밀어 문서 순서를 보존한다.
  //       인접 가정 금지. 참고: DREAMPATH-HISTORY.md 2026-06-09.
  // Reunite every split tail with its source node, then pull the canonical
  // ordered flow back onto page 1 and drop continuation pages.
  function restoreFlowToFirst(fr){
    var first=fr.querySelector('.docbox');
    var body=pageBody(first);
    if(!body) return;
    // reunite continuation-section rows back into their source section's list
    // (document order = page order = row order), then drop the continuation sec.
    [].slice.call(fr.querySelectorAll('.sec[data-cont-of]')).forEach(function(cs){
      var sid=cs.getAttribute('data-cont-of');
      var sel='[data-sec-id="'+((window.CSS&&CSS.escape)?CSS.escape(sid):sid)+'"]';
      var src=fr.querySelector(sel);
      var srcList=src && src.querySelector('ul, ol');
      var csList=cs.querySelector('ul, ol');
      if(srcList && csList){
        [].slice.call(csList.children).forEach(function(li){ if(li.tagName==='LI') srcList.appendChild(li); });
      }
      if(cs.parentNode) cs.parentNode.removeChild(cs);
    });
    [].slice.call(fr.querySelectorAll('[data-split-of]')).forEach(function(t){
      var srcId=t.getAttribute('data-split-of');
      var sel='[data-split-src="'+((window.CSS&&CSS.escape)?CSS.escape(srcId):srcId)+'"]';
      var src=fr.querySelector(sel);
      if(src) src.textContent=String(src.textContent||'')+String(t.textContent||'');
      if(t.parentNode) t.parentNode.removeChild(t);
    });
    [].slice.call(body.children).forEach(function(n){
      if(n.hasAttribute && n.hasAttribute('data-auto-flow-anchor') && !String(n.textContent||'').trim()) n.remove();
    });
    collectFlowNodes(fr).forEach(function(n){ body.appendChild(n); });
    [].slice.call(fr.querySelectorAll('.docbox.cont')).forEach(function(c){ c.remove(); });
  }
  function ensureEditableStart(fr){
    var first=fr && fr.querySelector('.docbox');
    var body=pageBody(first);
    if(!body || !body.classList || !body.classList.contains('letter-body')) return;
    if(firstFlowNodes(first).length) return;
    var p=document.createElement('p');
    p.className='body';
    p.setAttribute('contenteditable','true');
    p.setAttribute('data-auto-flow-anchor','1');
    p.setAttribute('data-ph','Type here.');
    body.appendChild(p);
  }
  function boxOverflow(box){
    var doc=box && box.querySelector('.doc');
    if(!doc) return 0;
    return pageContentHeight(box) - overflowLimit(doc);
  }
  function canSplitNode(node){
    return !!(node && node.matches && node.matches('p.body, li, .sal, .encl') && splitUnits(node.textContent).length > 8);
  }
  function hasRichInline(node){
    if(!node) return false;
    return [].slice.call(node.children || []).some(function(ch){
      return ch.nodeType===1 && ch.tagName !== 'BR';
    });
  }
  function cloneForOverflow(node){
    var clone=node.cloneNode(false);
    clone.removeAttribute('data-dp-edit-id');
    clone.removeAttribute('data-dp-block-id');
    clone.setAttribute('contenteditable','true');
    // mark the spilled tail so the next reflow can merge it back into its
    // head node instead of leaving a paragraph permanently fractured.
    clone.setAttribute('data-auto-split','1');
    return clone;
  }
  function splitUnits(text){
    text=String(text || '');
    var wordUnits=text.match(/\S+\s*/g) || [];
    if(wordUnits.length>1) return wordUnits;
    return Array.from(text);
  }
  // [CASE STUDY 2026-06-09 — scale-aware measurement]
  // 증상: 좁은 화면에서 .doc 가 transform:scale(s<1) 되면 페이지네이션이 과소 작동(분할 안 됨).
  // 원인: getBoundingClientRect 는 스케일 반영(화면 px), offsetTop/overflowLimit 은 미반영(레이아웃 px).
  //       둘을 직접 비교해 좌표계 불일치. 교훈: rect 기반 거리는 모두 docScale 로 나눠 레이아웃 px 로 환산.
  function docScale(box){
    var doc=box && box.querySelector('.doc');
    if(!doc) return 1;
    var w=doc.offsetWidth, r=doc.getBoundingClientRect();
    return (w && r.width) ? (r.width / w) : 1;
  }
  function measureHeight(node, text){
    var clone=cloneForOverflow(node);
    clone.style.position='absolute';
    clone.style.visibility='hidden';
    clone.style.pointerEvents='none';
    clone.style.left='-10000px';
    clone.style.top='0';
    // unscaled layout width (offsetWidth), NOT the scaled getBoundingClientRect width
    clone.style.width=Math.max(1, node.offsetWidth || 320)+'px';
    clone.textContent=text;
    document.body.appendChild(clone);
    var height=clone.scrollHeight || clone.offsetHeight || 0;
    clone.remove();
    return height;
  }
  function fitSplitIndex(box, node, units){
    var doc=box && box.querySelector('.doc');
    var pad=box && box.querySelector('.pad');
    if(!doc || !pad || !node || units.length<2) return 0;
    var s=docScale(box) || 1;
    var nr=node.getBoundingClientRect();
    var pr=pad.getBoundingClientRect();
    var top=(nr.top - pr.top) / s;
    var available=overflowLimit(doc) - top;
    if(available<24) return 0;
    var low=1, high=units.length-1, best=0;
    while(low<=high){
      var mid=Math.floor((low+high)/2);
      var height=measureHeight(node, units.slice(0, mid).join(''));
      if(height<=available){ best=mid; low=mid+1; }
      else high=mid-1;
    }
    return best;
  }
  function nodeBottomInPage(box, node){
    var pad=box && box.querySelector('.pad');
    if(!pad || !node) return 0;
    var s=docScale(box) || 1;
    var nr=node.getBoundingClientRect();
    var pr=pad.getBoundingClientRect();
    return (nr.bottom - pr.top) / s;  // → layout px, matches overflowLimit
  }
  // Split a plain-text node at the page boundary; returns the tail node (NOT yet
  // inserted) carrying data-split-of so a later reflow can reunite it, or null
  // if the node cannot be usefully split at this position.
  function makeSplitTail(box, node){
    if(!canSplitNode(node) || hasRichInline(node)) return null;
    var original=String(node.textContent||'');
    var units=splitUnits(original);
    if(units.length<2) return null;
    var idx=fitSplitIndex(box, node, units);
    if(idx<1 || idx>=units.length) return null;
    var head=units.slice(0, idx).join('');
    var tail=units.slice(idx).join('');
    if(!head || !tail || head+tail!==original) return null;
    var overflow=cloneForOverflow(node);
    overflow.setAttribute('data-split-of', splitSrcId(node));
    node.textContent=head;
    overflow.textContent=tail;
    return overflow;
  }
  function ensureNextBox(fr, currentBox){
    var next=currentBox && currentBox.nextElementSibling;
    if(next && next.classList.contains('docbox')) return next;
    var parent=fr.querySelector('.docbox') && fr.querySelector('.docbox').parentNode;
    var count=fr.querySelectorAll('.docbox').length;
    next=makeContinuationPage(fr, count+1);
    if(next && parent) parent.appendChild(next);
    return next;
  }
  function secId(sec){
    var id=sec.getAttribute('data-sec-id');
    if(!id){ id='sec'+(++__splitSeq); sec.setAttribute('data-sec-id', id); }
    return id;
  }
  // [CASE STUDY 2026-06-09 — row-level section flow]
  // 증상: 리스트가 긴 섹션이 통째로 다음 장으로 넘어가 앞 장이 비어 보임.
  // 교훈: 섹션은 못 쪼개도 그 안의 <li> 행은 경계에서 분할한다. 넘치는 행만 다음 장의
  //       "연속 섹션"(머리글 복제 + 빈 리스트)으로 옮기고, 모든 연속 섹션은 data-cont-of로
  //       항상 "원본" 섹션을 가리켜(다단계여도) restore에서 순서대로 재결합한다.
  // Split a section's list at the page boundary: keep the rows that fit, move the
  // overflowing <li> into a continuation section on the next page. Returns the
  // continuation section, or null if the list can't be usefully split here.
  function splitSectionRows(box, sec, next, limit){
    if(!sec || !sec.matches || !sec.matches('.sec')) return null;
    var list=sec.querySelector('ul, ol');
    if(!list) return null;
    var rows=[].slice.call(list.children).filter(function(n){ return n.tagName==='LI'; });
    if(rows.length<2) return null;
    var breakI=-1;
    for(var i=0;i<rows.length;i++){ if(nodeBottomInPage(box, rows[i])>limit){ breakI=i; break; } }
    if(breakI<1) return null;  // 0 rows fit (nothing gained) or all rows fit
    var nextBody=pageBody(next);
    if(!nextBody) return null;
    // continuation sections always point back to the ORIGINAL source (even when
    // splitting an already-continued section) so multi-page lists reunite safely.
    var sid=sec.getAttribute('data-cont-of') || secId(sec);
    var key=(window.CSS&&CSS.escape)?CSS.escape(sid):sid;
    var contSec=nextBody.querySelector('.sec[data-cont-of="'+key+'"]');
    if(!contSec){
      contSec=document.createElement('div');
      contSec.className=(sec.getAttribute('class')||'sec').replace(/\bdp-template-edit-block\b/g,'').replace(/\s+/g,' ').trim() || 'sec';
      contSec.setAttribute('data-cont-of', sid);
      var h3=sec.querySelector('h3');
      if(h3){ var hc=h3.cloneNode(true); hc.removeAttribute('data-dp-edit-id'); hc.removeAttribute('data-dp-block-id'); hc.removeAttribute('contenteditable'); contSec.appendChild(hc); }
      var nl=document.createElement(list.tagName);
      var lc=list.getAttribute('class'); if(lc) nl.className=lc;
      contSec.appendChild(nl);
      nextBody.insertBefore(contSec, nextBody.firstChild);
    }
    var contList=contSec.querySelector('ul, ol');
    var cref=contList.firstChild;
    for(var j=breakI;j<rows.length;j++){ contList.insertBefore(rows[j], cref); }
    return contSec;
  }
  // Push the first node that crosses the page boundary (split if it is plain
  // text) together with every node after it onto the next page, preserving
  // document order. Returns true if anything moved.
  function paginateBox(fr, box){
    var doc=box.querySelector('.doc');
    if(!doc) return false;
    var limit=overflowLimit(doc);
    var nodes=box.classList.contains('cont') ? contFlowNodes(box) : firstFlowNodes(box);
    if(!nodes.length) return false;
    var breakIdx=-1;
    for(var i=0;i<nodes.length;i++){
      if(nodeBottomInPage(box, nodes[i])>limit){ breakIdx=i; break; }
    }
    if(breakIdx<0) return false;
    var next=ensureNextBox(fr, box);
    var nextBody=pageBody(next);
    if(!nextBody) return false;
    var ref=nextBody.firstChild;
    var moveFrom=breakIdx;
    var breaker=nodes[breakIdx];
    var tail=makeSplitTail(box, breaker);
    if(tail){
      nextBody.insertBefore(tail, ref); moveFrom=breakIdx+1;
    } else if(splitSectionRows(box, breaker, next, limit)){
      // section's list flowed row-by-row; the section keeps the rows that fit.
      moveFrom=breakIdx+1;
    } else if(breakIdx===0){
      return false;  // single oversized node we can't split → leave (clip) rather than spawn endless pages
    }
    for(var j=moveFrom;j<nodes.length;j++){ nextBody.insertBefore(nodes[j], ref); }
    return true;
  }
  function updatePageNumbers(fr){
    var pages=[].slice.call(fr.querySelectorAll('.docbox'));
    var total=pages.length || 1;
    pages.forEach(function(box,i){
      var p=box.querySelector('.doc-foot .pageno');
      if(p) p.textContent='Page '+(i+1)+' of '+total;
    });
  }
  function overflowLimit(doc){
    var foot=doc.querySelector('.doc-foot');
    var pad=doc.querySelector('.pad');
    if(!pad) return doc.clientHeight - 60;
    var footTop = foot ? foot.offsetTop : doc.clientHeight - 30;
    return Math.max(120, footTop - pad.offsetTop - 18);
  }
  function pageContentHeight(box){
    var pad=box.querySelector('.pad');
    if(!pad) return 0;
    var max=0;
    [].slice.call(pad.children).forEach(function(ch){
      var bottom=ch.offsetTop + ch.scrollHeight;
      if(bottom>max) max=bottom;
    });
    return max;
  }
  // Record where the caret sits inside the currently-focused editable field,
  // as a plain character offset keyed by the parent-assigned data-dp-edit-id.
  function captureCaret(){
    var sel=document.getSelection && document.getSelection();
    if(!sel || !sel.rangeCount || !sel.anchorNode) return null;
    var node=sel.anchorNode;
    var host=node.nodeType===1 ? node : node.parentNode;
    host=host && host.closest && host.closest('[contenteditable="true"]');
    if(!host) return null;
    var id=host.getAttribute('data-dp-edit-id');
    if(!id) return null;
    var range=document.createRange();
    range.selectNodeContents(host);
    try { range.setEnd(sel.anchorNode, sel.anchorOffset); }
    catch(e){ return { id:id, offset:0 }; }
    return { id:id, offset:range.toString().length };
  }
  function restoreCaret(snap){
    if(!snap || !snap.id) return;
    var key=(window.CSS && CSS.escape) ? CSS.escape(snap.id) : snap.id;
    var host=document.querySelector('[data-dp-edit-id="'+key+'"]');
    if(!host) return;
    var walker=document.createTreeWalker(host, NodeFilter.SHOW_TEXT, null);
    var range=document.createRange(), walked=0, placed=false, tn;
    while((tn=walker.nextNode())){
      var len=tn.nodeValue.length;
      if(walked+len>=snap.offset){ range.setStart(tn, Math.max(0, snap.offset-walked)); placed=true; break; }
      walked+=len;
    }
    if(!placed){ range.selectNodeContents(host); range.collapse(false); }
    else { range.collapse(true); }
    try { host.focus({ preventScroll:true }); } catch(e){ try { host.focus(); } catch(_){} }
    var sel=document.getSelection();
    if(sel){ sel.removeAllRanges(); sel.addRange(range); }
  }

  // [CASE STUDY 2026-06-09 — Document Templates reflow caret loss]
  // 증상: Official Letter 등에서 본문을 입력하면 글자가 반영 안 되고 커서가 튐.
  // 원인: 이 함수가 매 입력마다 restoreFlowToFirst 로 모든 문단 노드를 appendChild
  //       재배치 → 포커스 노드가 DOM 에서 분리·재부착되며 캐럿이 파괴됨.
  // 교훈: (1) 오버플로가 없으면 노드를 절대 옮기지 말 것(아래 fast path),
  //       (2) 옮겨야 할 때는 captureCaret→reflow→restoreCaret 로 캐럿 보존.
  // 참고: DREAMPATH-HISTORY.md 2026-06-09, dist-homepage/templates-app.js.
  function syncAutoPages(){
    var fr=activePaper();
    if(!fr){ fit(); return; }
    var first=fr.querySelector('.docbox');
    if(!first){ fit(); return; }
    // Fast path: a single page that does not overflow needs no node movement.
    // Skipping the reflow here keeps the caret intact for the common case.
    if(fr.querySelectorAll('.docbox').length===1 && boxOverflow(first)<=0){
      ensureEditableStart(fr);
      updatePageNumbers(fr);
      fit();
      window.dispatchEvent(new CustomEvent('tplchange', { detail: activeTarget() }));
      return;
    }
    var caret=captureCaret();
    restoreFlowToFirst(fr);
    // Each page fills maximally, then pushes its remainder forward, so one pass
    // per page in order is enough. guard is a backstop, not the mechanism.
    var guard=0;
    var boxes=[].slice.call(fr.querySelectorAll('.docbox'));
    for(var i=0;i<boxes.length && guard<80;i++){
      if(paginateBox(fr, boxes[i])) guard++;
      boxes=[].slice.call(fr.querySelectorAll('.docbox'));
    }
    var last;
    while((last=fr.querySelector('.docbox.cont:last-child'))){
      if(contFlowNodes(last).length) break;
      last.remove();
    }
    ensureEditableStart(fr);
    updatePageNumbers(fr);
    fit();
    restoreCaret(caret);
    window.dispatchEvent(new CustomEvent('tplchange', { detail: activeTarget() }));
  }
  var autoTimer=null;
  function scheduleAutoPages(){
    clearTimeout(autoTimer);
    // slightly longer debounce reduces reflow churn during fast typing.
    autoTimer=setTimeout(syncAutoPages, 130);
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
    scheduleAutoPages();

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

  document.addEventListener('input', scheduleAutoPages, true);
  window.DPTemplateSyncPages = syncAutoPages;

  // ---- sample content (per-field data-sample) ----
  // Fill the active document with its built-in example so a user can see how to
  // write it; Clear empties every field back to its data-ph prompt.
  window.DPTemplateFillSample = function(){
    var fr=activeFrame(); if(!fr) return;
    restoreFlowToFirst(fr);  // collapse any prior split state to single source nodes
    [].slice.call(fr.querySelectorAll('[data-sample]')).forEach(function(el){
      el.textContent=el.getAttribute('data-sample')||'';
    });
    syncAutoPages();
  };
  window.DPTemplateClearSample = function(){
    var fr=activeFrame(); if(!fr) return;
    restoreFlowToFirst(fr);  // pull any continuation tails back first so nothing lingers
    [].slice.call(fr.querySelectorAll('[data-sample]')).forEach(function(el){ el.textContent=''; });
    syncAutoPages();
  };

  // ---- Notion-style markdown shortcuts + Tab/Shift+Tab indent ----
  // Only inside content areas (.letter-body / .pr-body / .sec); meta fields,
  // titles and the doc number keep plain Tab/typing behaviour.
  function _mdBlock(){
    var sel=document.getSelection&&document.getSelection();
    if(!sel||!sel.rangeCount) return null;
    var n=sel.anchorNode, el=n&&(n.nodeType===1?n:n.parentNode);
    el=el&&el.closest&&el.closest('[contenteditable="true"]');
    if(!el || el.matches('h1,h2,h3,th')) return null;
    return el.closest('.letter-body, .pr-body, .sec') ? el : null;
  }
  function _mdCaretStart(el){
    var sel=document.getSelection(), r=document.createRange();
    r.selectNodeContents(el); r.collapse(true);
    sel.removeAllRanges(); sel.addRange(r);
  }
  document.addEventListener('input', function(){
    var el=_mdBlock(); if(!el) return;
    var txt=el.textContent||'', m;
    // # / ## / ### -> heading (more hashes = smaller, standard markdown/Notion)
    if((m=txt.match(/^(#{1,3})[\s ]/))){
      el.classList.remove('md-h1','md-h2','md-h3','md-bullet','md-num');
      el.classList.add('md-h'+m[1].length);
      el.textContent=txt.slice(m[0].length); _mdCaretStart(el);
    } else if((m=txt.match(/^[-*][\s ]/))){
      el.classList.remove('md-h1','md-h2','md-h3','md-num');
      el.classList.add('md-bullet');
      el.textContent=txt.slice(m[0].length); _mdCaretStart(el);
    } else if((m=txt.match(/^\d+\.[\s ]/))){
      el.classList.remove('md-h1','md-h2','md-h3','md-bullet');
      el.classList.add('md-num');
      el.textContent=txt.slice(m[0].length); _mdCaretStart(el);
    }
  }, true);
  document.addEventListener('keydown', function(e){
    if(e.key!=='Tab') return;
    var el=_mdBlock(); if(!el) return;
    e.preventDefault();
    var lvl=parseInt(el.getAttribute('data-indent')||'0',10);
    lvl = e.shiftKey ? Math.max(0,lvl-1) : Math.min(5,lvl+1);
    if(lvl) el.setAttribute('data-indent',String(lvl)); else el.removeAttribute('data-indent');
    scheduleAutoPages();
  }, true);
  // expose for tests
  window.DPTemplateMdBlock = _mdBlock;

  // Force plain-text paste. Rich/multi-line clipboard HTML used to inject nested
  // <ul>/<li> or indentation, so Ctrl+V dropped the caret into a sub-level. We
  // insert plain text (newlines -> <br>) inside the same field instead.
  document.addEventListener('paste', function(e){
    var n=document.getSelection&&document.getSelection().anchorNode;
    var el=n&&(n.nodeType===1?n:n.parentNode);
    el=el&&el.closest&&el.closest('[contenteditable="true"]');
    if(!el || !e.clipboardData) return;
    e.preventDefault();
    var text=e.clipboardData.getData('text/plain')||'';
    var sel=document.getSelection();
    if(!(sel&&sel.rangeCount)){ return; }
    var r=sel.getRangeAt(0); r.deleteContents();
    var parts=text.split(/\r\n|\r|\n/);
    var frag=document.createDocumentFragment();
    parts.forEach(function(p,i){ if(i) frag.appendChild(document.createElement('br')); frag.appendChild(document.createTextNode(p)); });
    var last=frag.lastChild;
    r.insertNode(frag);
    if(last){ r.setStartAfter(last); r.collapse(true); sel.removeAllRanges(); sel.addRange(r); }
    el.dispatchEvent(new Event('input',{bubbles:true}));
  }, true);

  window.addEventListener('resize', function(){ fit(); scheduleAutoPages(); });

  // init
  var initial = location.hash.slice(1);
  var valid = btns.some(function(b){ return b.getAttribute('data-target')===initial; });
  select(valid ? initial : 'guide');
  if(document.fonts && document.fonts.ready){ document.fonts.ready.then(fit); }
  setTimeout(function(){ fit(); syncAutoPages(); }, 350);
})();
