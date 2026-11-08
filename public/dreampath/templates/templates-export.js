/* ============================================================
   DreamPath Document Templates — Word (.doc) / Docs export
   Builds clean, table-based Word HTML from the live (edited)
   template so it opens faithfully in Word, Google Docs & Hancom.
   ============================================================ */
(function(){
  var A = window.DP_ASSETS || { mark:'', markWhite:'', star:{} };
  var ADDR = '120-48, Mokhyo-ro, Yongjin-eup, Wanju-gun, Jeonbuk-do 55353, Republic of Korea';
  var EMAIL = 'hello@koreadreampath.com';
  var WEB = 'koreadreampath.com';
  var IMPCOL = { standard:'#1E1654', important:'#6B2DBE', priority:'#F4B72E' };
  var IMPINK = { standard:'#1E1654', important:'#6B2DBE', priority:'#9A6608' };
  var IMPL   = { standard:'Standard', important:'Important', priority:'Priority' };
  var NAMES = {
    guide:'DreamPath - Format Guide',
    letterhead:'DreamPath - Official Letter', press:'DreamPath - Press Release',
    weekly:'DreamPath - Weekly Report', brief:'DreamPath - Project Brief', general:'DreamPath - Internal Document',
    minutes:'DreamPath - Meeting Minutes', 'cover-p':'DreamPath - Cover', 'cover-l':'DreamPath - Cover (Landscape)',
    envelope:'DreamPath - Envelope',
    card:'DreamPath - Business Card', sig:'DreamPath - Email Signature'
  };

  function ih(scope, sel){ var e=scope.querySelector(sel); return e?e.innerHTML:''; }
  function it(scope, sel){ var e=scope.querySelector(sel); return e?e.innerText:''; }

  // ---- shared chrome ----
  function header(scope, doctype){
    var imp = document.body.getAttribute('data-importance')||'standard';
    var hideStar = document.body.classList.contains('hide-star');
    var dn=scope&&scope.querySelector('.docref b');
    var dnHtml = dn ? '<div style="font-size:8pt;color:#8A8A93;margin-top:3pt">No. '+dn.innerText+'</div>' : '';
    var chip = hideStar ? '' :
      '<img src="'+A.star[imp]+'" width="11" height="11" style="vertical-align:middle"> '+
      '<span style="font-size:8pt;font-weight:bold;letter-spacing:1.5px;color:'+IMPINK[imp]+'">'+IMPL[imp].toUpperCase()+'</span>';
    return (hideStar?'':'<div style="border-top:4pt solid '+IMPCOL[imp]+';font-size:1pt;line-height:2pt">&nbsp;</div>')+
      '<table width="100%" style="border-collapse:collapse"><tr>'+
      '<td valign="middle"><img src="'+A.mark+'" width="40" height="38" style="vertical-align:middle"> '+
        '<span style="font-size:16pt;font-weight:bold;color:#1E1654;letter-spacing:-0.5px">Dream Path</span>'+
        '<div style="font-size:7pt;letter-spacing:1.5px;color:#8A8A93">Education Initiatives</div></td>'+
      '<td align="right" valign="middle"><div style="font-size:10pt;font-weight:bold;letter-spacing:2px;color:#6B2DBE;text-transform:uppercase">'+doctype+'</div>'+dnHtml+
        '<div style="margin-top:4pt">'+chip+'</div></td></tr></table>'+
      '<div style="border-top:1.5pt solid #1E1654;font-size:1pt;line-height:2pt;margin-top:6pt">&nbsp;</div>';
  }
  function footer(scope){
    var sb = scope && scope.querySelector('.doc-foot .sentby');
    var sender = sb ? ('<b style="color:#1F1F1F">'+sb.innerText+'</b> &middot; ') : '';
    return '<div style="border-top:0.75pt solid #E3E3E0;margin-top:20pt;padding-top:6pt;font-size:7.5pt;color:#8A8A93;line-height:1.5">'+
      sender+'Korea Dream Path &middot; '+ADDR+'<br>'+EMAIL+' &middot; '+WEB+'</div>'+
      '<p style="text-align:center;font-size:7.5pt;color:#8A8A93;margin-top:8pt">Page '+
        '<!--[if supportFields]><span style=\'mso-element:field-begin\'></span> PAGE <span style=\'mso-element:field-end\'></span><![endif]--><![if !supportFields]>1<![endif]>'+
        ' of <!--[if supportFields]><span style=\'mso-element:field-begin\'></span> NUMPAGES <span style=\'mso-element:field-end\'></span><![endif]--><![if !supportFields]>1<![endif]></p>';
  }
  function h3(t){ return '<p style="font-size:11pt;font-weight:bold;color:#1E1654;margin:15pt 0 5pt">'+t+'</p>'; }
  function kl(t){ return '<div style="font-size:8pt;font-weight:bold;letter-spacing:1.5px;text-transform:uppercase;color:#8A8A93;margin-bottom:3pt">'+t+'</div>'; }

  function titleBlock(scope){
    var k=scope.querySelector('.dtitle .kick'); var h=scope.querySelector('.dtitle h1');
    return (k?'<div style="font-size:8pt;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:#6B2DBE;margin-top:16pt">'+k.innerText+'</div>':'')+
      '<h1 style="font-size:21pt;color:#1E1654;margin:5pt 0 0;letter-spacing:-0.5px">'+(h?h.innerHTML:'')+'</h1>';
  }
  function metaList(scope){
    var out='<table width="100%" style="border-collapse:collapse;margin:12pt 0">';
    scope.querySelectorAll('.mgrid .m').forEach(function(m){
      out+='<tr><td width="135" style="padding:4pt 0;font-size:8pt;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:#8A8A93;vertical-align:top">'+it(m,'.label')+'</td>'+
        '<td style="padding:4pt 0;font-size:11pt">'+it(m,'.v')+'</td></tr>';
    });
    return out+'</table>';
  }
  function wordTable(tbl){
    var out='<table width="100%" style="border-collapse:collapse;margin:4pt 0 9pt"><tr>';
    tbl.querySelectorAll('thead th').forEach(function(th){
      out+='<td style="border-bottom:1.5pt solid #1E1654;padding:4pt 8pt 5pt 0;font-size:8pt;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:#8A8A93">'+th.innerText+'</td>';
    });
    out+='</tr>';
    tbl.querySelectorAll('tbody tr').forEach(function(tr){
      out+='<tr>'; [].forEach.call(tr.children,function(td){ out+='<td style="border-bottom:0.75pt solid #E3E3E0;padding:6pt 8pt;font-size:10pt;vertical-align:top">'+td.innerHTML+'</td>'; }); out+='</tr>';
    });
    return out+'</table>';
  }
  function secBlock(el){
    var out=''; var h=el.querySelector('h3'); if(h) out+=h3(h.innerHTML);
    var list=el.querySelector('ul,ol');
    if(list){ var tag=list.tagName.toLowerCase(); out+='<'+tag+' style="margin:0 0 9pt 18pt">';
      [].forEach.call(list.children,function(li){ out+='<li style="margin-bottom:4pt;font-size:10.5pt">'+li.innerHTML+'</li>'; }); out+='</'+tag+'>'; }
    var sr=el.querySelector('.statusrow');
    if(sr){ var ps=[].map.call(sr.querySelectorAll('.pill'),function(p){return '[ ] '+p.innerText.trim();}); out+='<p style="font-size:10.5pt">'+ps.join('&nbsp;&nbsp;&nbsp;&nbsp;')+'</p>'; }
    el.querySelectorAll(':scope > p.body, :scope > p.encl').forEach(function(p){ out+='<p style="font-size:10.5pt">'+p.innerHTML+'</p>'; });
    var tbl=el.querySelector('table.atable'); if(tbl) out+=wordTable(tbl);
    return out;
  }
  function approvalBoxes(scope){
    var out='<table width="100%" style="border-collapse:collapse;margin:14pt 0"><tr>';
    scope.querySelectorAll('.approval .ab').forEach(function(ab){
      out+='<td width="33%" style="border:0.75pt solid #DDDDDD;padding:0;vertical-align:top">'+
        '<div style="font-size:8pt;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:#8A8A93;text-align:center;padding:6pt" bgcolor="#F6F5F2">'+it(ab,'.ah')+'</div>'+
        '<div style="height:54pt;border-top:0.5pt solid #EEEEEE">&nbsp;</div>'+
        '<div style="font-size:9pt;text-align:center;padding:6pt;border-top:0.5pt solid #EEEEEE">'+it(ab,'.aname')+'</div></td>';
    });
    return out+'</tr></table>';
  }
  function reqGrid(scope){
    var nodes=scope.querySelectorAll('.req-grid > div');
    var out='<table width="100%" style="border-collapse:collapse;margin:12pt 0">';
    for(var i=0;i<nodes.length;i+=2){
      var amt=nodes[i+1]&&nodes[i+1].classList.contains('amount');
      out+='<tr><td width="135" style="padding:7pt 0;border-bottom:0.5pt solid #EEEEEE;font-size:8pt;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:#8A8A93;vertical-align:top">'+nodes[i].innerText+'</td>'+
        '<td style="padding:7pt 0;border-bottom:0.5pt solid #EEEEEE;font-size:'+(amt?'13pt':'11pt')+';'+(amt?'font-weight:bold;color:#1E1654':'')+'">'+(nodes[i+1]?nodes[i+1].innerHTML:'')+'</td></tr>';
    }
    return out+'</table>';
  }
  function kpis(scope){
    var out='<table width="100%" style="border-collapse:collapse;margin:8pt 0"><tr>';
    scope.querySelectorAll('.kpi').forEach(function(k){
      out+='<td width="33%" style="border:0.75pt solid #DDDDDD;padding:12pt 14pt;vertical-align:top">'+
        '<div style="font-size:20pt;font-weight:bold;color:#1E1654;line-height:1">'+it(k,'.kn')+'</div>'+
        '<div style="font-size:9pt;color:#8A8A93;margin-top:5pt">'+it(k,'.kl')+'</div></td>';
    });
    return out+'</tr></table>';
  }

  // ---- per-template bodies ----
  function letterBody(scope){
    var rs=scope.querySelectorAll('.refrow .meta .r');
    var ref=rs[0]?ih(rs[0],'.v'):'', date=rs[1]?ih(rs[1],'.v'):'', deliv=rs[2]?ih(rs[2],'.v'):'';
    function mrow(l,v,c){ return '<div style="font-size:8pt;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:#8A8A93">'+l+'</div>'+
      '<div style="font-size:11pt;'+(c?'color:#6B2DBE;font-weight:bold;':'')+'margin-bottom:8pt">'+v+'</div>'; }
    var paras=[].map.call(scope.querySelectorAll('.letter-body > .body'),function(p){return '<p style="font-size:11pt">'+p.innerHTML+'</p>';}).join('');
    return '<table width="100%" style="border-collapse:collapse;margin-top:16pt"><tr>'+
      '<td valign="top" width="56%">'+kl('To')+'<div style="font-size:11pt;line-height:1.5">'+ih(scope,'.refrow .to .line')+'</div></td>'+
      '<td valign="top" width="44%" style="text-align:right">'+mrow('Our ref',ref)+mrow('Date',date)+(deliv?mrow('Delivery',deliv,true):'')+'</td>'+
      '</tr></table>'+
      '<p style="margin:16pt 0 0;padding:7pt 0;border-top:0.75pt solid #EEEEEE;border-bottom:0.75pt solid #EEEEEE"><span style="font-size:9pt;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:#6B2DBE">Subject</span>&nbsp;&nbsp;<b style="font-size:11.5pt">'+ih(scope,'.subjline .v')+'</b></p>'+
      '<p style="margin-top:14pt;font-size:11pt"><b>'+ih(scope,'.letter-body .sal')+'</b></p>'+paras+
      '<p style="margin-top:14pt;font-size:11pt">'+ih(scope,'.sign .cl')+'</p>'+
      '<p style="margin-top:20pt;font-size:11pt"><b>'+ih(scope,'.sign .nm')+'</b><br><span style="color:#8A8A93">'+ih(scope,'.sign .ti')+'</span></p>'+
      '<p style="margin-top:16pt;font-style:italic;color:#8A8A93;font-size:9.5pt">'+ih(scope,'.encl')+'</p>';
  }
  function memoBody(scope){
    var out=titleBlock(scope)+'<table width="100%" style="border:0.75pt solid #DDDDDD;border-collapse:collapse;margin:14pt 0">';
    scope.querySelectorAll('.memo-block .mr').forEach(function(m){
      out+='<tr><td width="80" style="padding:7pt 12pt;border-bottom:0.5pt solid #EEEEEE;font-size:8pt;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:#8A8A93">'+it(m,'.label')+'</td>'+
        '<td style="padding:7pt 12pt;border-bottom:0.5pt solid #EEEEEE;font-size:11pt;font-weight:bold">'+ih(m,'.v')+'</td></tr>';
    });
    out+='</table>';
    var lb=scope.querySelector('.letter-body');
    [].forEach.call(lb.children,function(el){
      if(el.classList.contains('body')) out+='<p style="font-size:11pt">'+el.innerHTML+'</p>';
      else if(el.classList.contains('sec')) out+=secBlock(el);
    });
    return out;
  }
  function pressBody(scope){
    var paras=[].map.call(scope.querySelectorAll('.pr-body > .body'),function(p){return '<p style="font-size:11pt">'+p.innerHTML+'</p>';}).join('');
    return '<table width="100%" style="border-collapse:collapse;margin-top:14pt"><tr>'+
      '<td valign="top" width="50%"><span style="font-size:9pt;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:#248737">'+ih(scope,'.pr-flag')+'</span></td>'+
      '<td valign="top" width="50%" style="text-align:right;font-size:8.5pt;color:#8A8A93;line-height:1.5"><b style="color:#1F1F1F;letter-spacing:1px;text-transform:uppercase;font-size:8pt">Media contact</b><br>'+ih(scope,'.pr-contact div')+'</td>'+
      '</tr></table>'+
      '<h1 style="font-size:19pt;color:#1E1654;margin:14pt 0 0;letter-spacing:-0.5px;line-height:1.15">'+ih(scope,'.pr-head h1')+'</h1>'+
      '<p style="font-size:12pt;color:#55555c;margin-top:9pt">'+ih(scope,'.pr-head .sub')+'</p>'+
      '<div style="height:6pt"></div>'+paras+
      '<div style="margin-top:6pt">'+kl('About DreamPath')+'<p style="font-size:10.5pt;color:#55555c">'+ih(scope,'.pr-about .body')+'</p></div>'+
      '<p style="text-align:center;letter-spacing:4px;color:#8A8A93;font-weight:bold;margin-top:12pt">'+it(scope,'.pr-end')+'</p>';
  }
  function structured(scope){
    var out=titleBlock(scope);
    if(scope.querySelector('.mgrid')) out+=metaList(scope);
    if(scope.querySelector('.approval')) out+=approvalBoxes(scope);
    if(scope.querySelector('.req-grid')) out+=reqGrid(scope);
    if(scope.querySelector('.kpis')) out+=kpis(scope);
    scope.querySelectorAll('.pad .sec').forEach(function(s){ out+=secBlock(s); });
    return out;
  }
  function coverBody(scope, land){
    var metaCells=[].map.call(scope.querySelectorAll('.cover-meta .cm'),function(cm){
      return '<td style="padding-right:34pt;vertical-align:top"><div style="font-size:7.5pt;letter-spacing:1.5px;text-transform:uppercase;color:#B9B0D6">'+it(cm,'.label')+'</div>'+
        '<div style="font-size:10.5pt;color:#ffffff;font-weight:bold;margin-top:4pt">'+ih(cm,'.v')+'</div></td>';
    }).join('');
    return '<table width="100%" height="'+(land?460:640)+'" style="border-collapse:collapse"><tr>'+
      '<td bgcolor="#1E1654" valign="top" style="background:#1E1654;padding:36pt 34pt">'+
      '<table width="100%"><tr><td valign="middle"><img src="'+A.markWhite+'" width="36" height="34" style="vertical-align:middle"> <span style="font-size:15pt;font-weight:bold;color:#ffffff">Dream Path</span></td>'+
      '<td align="right" valign="middle" style="font-size:8pt;letter-spacing:1.5px;text-transform:uppercase;color:#F4B72E">'+it(scope,'.ck')+'</td></tr></table>'+
      '<div style="height:'+(land?60:120)+'pt"></div>'+
      '<div style="width:42pt;border-top:3pt solid #F4B72E;font-size:1pt;line-height:2pt">&nbsp;</div>'+
      '<div style="font-size:9pt;letter-spacing:2px;text-transform:uppercase;color:#C7BEDE;margin:12pt 0">'+ih(scope,'.typ')+'</div>'+
      '<div style="font-size:'+(land?34:30)+'pt;font-weight:bold;color:#ffffff;line-height:1.1;letter-spacing:-1px">'+ih(scope,'.cover-mid h1')+'</div>'+
      '<div style="font-size:12pt;color:#D8D2E8;margin-top:14pt">'+ih(scope,'.sub')+'</div>'+
      '<div style="height:26pt"></div><table><tr>'+metaCells+'</tr></table>'+
      '</td></tr></table>';
  }
  function cardBody(){
    var back=document.querySelector('.frame.on .doc.card.back');
    var lns=[].map.call(back.querySelectorAll('.cinfo .ln span'),function(s){return '<div style="font-size:10pt;color:#55555c;margin-bottom:4pt">'+s.innerHTML+'</div>';}).join('');
    return '<table width="300" style="border-collapse:collapse"><tr><td bgcolor="#1E1654" align="center" style="background:#1E1654;padding:28pt 20pt;text-align:center">'+
      '<img src="'+A.markWhite+'" width="40" height="38"><div style="font-size:18pt;font-weight:bold;color:#ffffff;margin-top:7pt">Dream Path</div>'+
      '<div style="font-size:7pt;letter-spacing:1.5px;color:#C7BEDE;text-transform:uppercase;margin-top:5pt">Education Initiatives</div></td></tr></table>'+
      '<div style="height:16pt"></div>'+
      '<div style="font-size:15pt;font-weight:bold;color:#1F1F1F">'+ih(back,'.nm')+'</div>'+
      '<div style="font-size:10pt;color:#6B2DBE;font-weight:bold;margin:2pt 0 10pt">'+ih(back,'.ti')+'</div>'+lns;
  }
  function sigBody(){
    var c=document.getElementById('sigCard');
    return '<table style="border-collapse:collapse"><tr><td style="border-left:3pt solid #6B2DBE;padding-left:12pt">'+
      '<div style="font-size:15pt;font-weight:bold">'+ih(c,'.nm')+'</div>'+
      '<div style="font-size:10pt;color:#8A8A93;padding:2pt 0 6pt">'+ih(c,'.ti')+'</div>'+
      '<div style="font-size:10pt;color:#55555c">'+ih(c,'.sg-info .ln')+'</div>'+
      '<div style="font-size:10pt"><a href="https://koreadreampath.com" style="color:#6B2DBE;text-decoration:none;font-weight:bold">koreadreampath.com</a></div>'+
      '</td></tr></table>';
  }
  function certBody(scope){
    var sigs=scope.querySelectorAll('.cert-sig');
    function sig(s){ return '<td width="36%" align="center" valign="bottom"><div style="border-top:1pt solid #1F1F1F;margin:0 24pt 6pt">&nbsp;</div>'+
      '<div style="font-size:11pt;font-weight:bold">'+ih(s,'b')+'</div><div style="font-size:8.5pt;color:#8A8A93">'+ih(s,'span')+'</div></td>'; }
    var seal = document.body.classList.contains('hide-seal') ? '' :
      '<img src="'+A.star.priority+'" width="34" height="34"><div style="font-size:7pt;font-weight:bold;letter-spacing:1.5px;color:#1E1654;margin-top:2pt">DREAMPATH</div>';
    return '<div style="border:2pt solid #1E1654;padding:12pt"><div style="border:0.75pt solid #F4B72E;padding:26pt 30pt;text-align:center">'+
      '<div style="font-size:14pt;font-weight:bold;color:#1E1654">Dream Path</div>'+
      '<div style="font-size:10pt;font-weight:bold;letter-spacing:3px;text-transform:uppercase;color:#6B2DBE;margin-top:20pt">'+it(scope,'#certKind')+'</div>'+
      '<div style="font-size:30pt;font-weight:bold;color:#1E1654;margin-top:6pt;letter-spacing:-0.5px">'+ih(scope,'.cert-title')+'</div>'+
      '<div style="font-size:11pt;color:#8A8A93;margin-top:18pt">This is to certify that</div>'+
      '<div style="font-size:28pt;font-weight:bold;color:#1F1F1F;margin-top:6pt">'+ih(scope,'.cert-name')+'</div>'+
      '<div style="font-size:11.5pt;color:#55555c;margin:16pt auto 0;max-width:470pt;line-height:1.6">'+ih(scope,'.cert-body')+'</div>'+
      '<table width="100%" style="margin-top:30pt"><tr>'+sig(sigs[0])+'<td width="28%" align="center" valign="bottom">'+seal+'</td>'+sig(sigs[1])+'</tr></table>'+
      '</div></div>';
  }
  function envBody(scope){
    var win = scope.querySelector('.env-to') && scope.querySelector('.env-to').classList.contains('win');
    var dl = scope.classList.contains('dl');
    return '<table width="100%"><tr><td valign="top"><img src="'+A.mark+'" width="32" height="30" style="vertical-align:top"> '+
      '<span style="font-size:13pt;font-weight:bold;color:#1E1654">Dream Path</span>'+
      '<div style="font-size:9.5pt;font-weight:bold;color:#1F1F1F;margin-top:5pt">'+it(scope,'.env-return .who')+'</div>'+
      '<div style="font-size:9.5pt;color:#55555c;line-height:1.5">'+ih(scope,'.env-return .addr')+'</div></td>'+
      '<td valign="top" align="right" width="110"><div style="border:1pt dashed #C4C4C4;padding:14pt 8pt;font-size:7pt;letter-spacing:1px;text-transform:uppercase;color:#8A8A93;text-align:center">Postage</div></td></tr></table>'+
      '<div style="height:'+(dl?34:80)+'pt"></div>'+
      '<table width="100%"><tr><td>&nbsp;</td><td width="62%" style="'+(win?'border:1pt solid #C4C4C4;padding:14pt 18pt':'')+'">'+
      '<div style="font-size:8pt;font-weight:bold;letter-spacing:1.5px;text-transform:uppercase;color:#8A8A93">To</div>'+
      '<div style="font-size:14pt;font-weight:bold;color:#1F1F1F;margin-top:5pt">'+ih(scope,'.env-to .nm')+'</div>'+
      '<div style="font-size:11pt;color:#55555c;line-height:1.6;margin-top:4pt">'+ih(scope,'.env-to .addr')+'</div></td></tr></table>';
  }

  function envWordSize(){
    var ed=document.getElementById('envDoc');
    var s = ed ? (ed.classList.contains('c4')?'c4':ed.classList.contains('c5')?'c5':'dl') : 'dl';
    return { dl:'220mm 110mm', c5:'229mm 162mm', c4:'324mm 229mm' }[s];
  }
  function guideBody(scope){
    function row(impKey, n, name, hex, use){
      var st=''; for(var i=0;i<n;i++){ st+='<img src="'+A.star[impKey]+'" width="13" height="13" style="vertical-align:middle"> '; }
      return '<tr><td width="110" style="padding:7pt 0;vertical-align:top">'+st+'</td>'+
        '<td style="padding:7pt 0"><b style="font-size:11pt;color:#1F1F1F">'+name+'</b> <span style="color:#8A8A93;font-size:9pt">&middot; '+hex+'</span><br><span style="font-size:10pt;color:#55555c">'+use+'</span></td></tr>';
    }
    function sw(name,hex){ return '<td width="33%" style="padding:4pt"><div bgcolor="'+hex+'" style="background:'+hex+';height:32pt">&nbsp;</div>'+
      '<div style="font-size:9.5pt;font-weight:bold;margin-top:4pt">'+name+'</div><div style="font-size:8.5pt;color:#8A8A93">'+hex+'</div></td>'; }
    var idx=['Official Letter','Press Release','Weekly Report','Project Brief','Meeting Minutes','Cover (portrait &amp; landscape)','Envelope (DL / C5 / C4)','Business Card','Email Signature']
      .map(function(x){return '<li style="margin-bottom:3pt">'+x+'</li>';}).join('');
    function scaleRow(u,sz,wt){ return '<tr><td style="padding:5pt 0;border-bottom:0.5pt solid #EEEEEE;font-size:10.5pt;color:#55555c">'+u+'</td>'+
      '<td width="90" style="padding:5pt 0;border-bottom:0.5pt solid #EEEEEE;font-size:10.5pt;font-weight:bold;color:#1E1654">'+sz+'</td>'+
      '<td width="150" style="padding:5pt 0;border-bottom:0.5pt solid #EEEEEE;font-size:9.5pt;color:#8A8A93">'+wt+'</td></tr>'; }
    return header(scope,'Format Guide')+
      '<div style="font-size:8pt;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:#6B2DBE;margin-top:16pt">'+it(scope,'.guide-title .kick')+'</div>'+
      '<h1 style="font-size:21pt;color:#1E1654;margin:5pt 0 0;letter-spacing:-0.5px">'+ih(scope,'.guide-title h1')+'</h1>'+
      '<p style="font-size:11pt;color:#55555c;margin-top:8pt">'+ih(scope,'.guide-title p')+'</p>'+
      h3('Importance — 3 levels')+'<table width="100%">'+row('standard',1,'Standard','Deep Indigo #1E1654','Routine, day-to-day documents')+row('important',2,'Important','Vivid Purple #6B2DBE','Confidential or decision-bearing')+row('priority',3,'Priority','Star Gold #F4B72E','Action required, time-critical')+'</table>'+
      h3('Brand palette — 3 tones only')+'<table width="100%"><tr>'+sw('Star Gold','#F4B72E')+sw('Vivid Purple','#6B2DBE')+sw('Deep Indigo','#1E1654')+'</tr></table>'+
      h3('Typeface — Pretendard')+'<p style="font-size:10.5pt;color:#55555c">One family for Latin and Hangul. Headings 700, body 400, eyebrow labels uppercase. Download: <a href="https://github.com/orioncactus/pretendard/releases/download/v1.3.9/Pretendard-1.3.9.zip">Pretendard 1.3.9 (.zip)</a> &middot; <a href="https://github.com/orioncactus/pretendard">github.com/orioncactus/pretendard</a></p>'+
      h3('Type scale (print sizes)')+'<table width="100%">'+
        scaleRow('Document title','22 pt','Bold 700')+scaleRow('Cover headline','30–34 pt','Bold 700')+scaleRow('Section heading','11 pt','Bold 700')+scaleRow('Body text','10.5–11 pt','Regular 400')+scaleRow('Eyebrow / label','8 pt','Bold 700 · UPPERCASE')+scaleRow('Footer &amp; caption','7.5 pt','Medium 500')+'</table>'+
      h3('Spacing &amp; layout (Word values)')+'<table width="100%">'+
        scaleRow('Margins (all sides)','2.2 cm','Layout › Margins › Custom')+scaleRow('Body line spacing','1.5 lines','Paragraph › Line spacing')+scaleRow('Heading line spacing','1.1–1.25','Paragraph › Line spacing')+scaleRow('Space after paragraph','9 pt','Paragraph › Spacing › After')+scaleRow('List item spacing','4 pt','Paragraph › Spacing › After')+scaleRow('Page size','A4 · 210×297 mm','Layout › Size')+'</table>'+
      h3('Don\u2019ts')+'<ul style="margin:0 0 0 16pt;font-size:10.5pt;color:#55555c"><li style="margin-bottom:3pt">Don\u2019t recolour the star \u2014 only the three brand tones.</li><li style="margin-bottom:3pt">Don\u2019t invent extra importance levels \u2014 there are exactly three.</li><li style="margin-bottom:3pt">Don\u2019t stretch, rotate, or recolour the logo.</li><li style="margin-bottom:3pt">Don\u2019t mix two importance colours in one document.</li><li>Don\u2019t use emoji \u2014 use the star and line icons.</li></ul>'+
      h3('Templates in this set')+'<ul style="margin:0 0 0 16pt;font-size:10.5pt;color:#55555c">'+idx+'</ul>'+
      h3('Editing &amp; export')+'<ol style="margin:0 0 0 16pt;font-size:10.5pt;color:#55555c"><li style="margin-bottom:3pt">Click any field and type — every value is editable.</li><li style="margin-bottom:3pt">Open Tweaks to set importance, status, and per-document options.</li><li>Save as PDF or Word — opens cleanly in Google Docs, Word, and Hancom.</li></ol>'+
      footer(scope);
  }

  function wrap(body, orient){
    var size = orient==='landscape' ? '841.95pt 595.35pt'
             : orient==='envelope' ? envWordSize()
             : '595.35pt 841.95pt';
    var margin = orient==='envelope' ? '1.2cm 1.4cm' : '2.2cm 2.2cm 1.8cm 2.2cm';
    return '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">'+
      '<head><meta charset="utf-8"><title>Dream Path</title>'+
      '<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->'+
      '<style>@page Section1{size:'+size+';margin:'+margin+';}div.Section1{page:Section1;}'+
      'body{font-family:\'Malgun Gothic\',\'Helvetica Neue\',Arial,sans-serif;color:#1F1F1F;font-size:11pt;line-height:1.55;}'+
      'p{margin:0 0 9pt;} h1{margin:0;} table{border-collapse:collapse;} a{color:#6B2DBE;}'+
      '</style></head><body><div class="Section1">'+body+'</div></body></html>';
  }
  function download(name, html){
    var blob=new Blob(['\ufeff'+html], {type:'application/msword'});
    var url=URL.createObjectURL(blob);
    var a=document.createElement('a'); a.href=url; a.download=name+'.doc';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){ URL.revokeObjectURL(url); }, 1500);
  }

  function toWord(target){
    var fr=document.querySelector('.frame.on'); if(!fr) return;
    var scope=fr.querySelector('.doc');
    var orient = (target==='cover-l') ? 'landscape' : (target==='envelope') ? 'envelope' : 'portrait';
    var body;
    switch(target){
      case 'guide':      body=guideBody(scope); break;
      case 'letterhead': body=header(scope,'Official Letter')+letterBody(scope)+footer(scope); break;
      case 'press':      body=header(scope,'Press Release')+pressBody(scope)+footer(scope); break;
      case 'weekly':     body=header(scope,'Weekly Report')+structured(scope)+footer(scope); break;
      case 'general':    body=header(scope,'Document')+structured(scope)+footer(scope); break;
      case 'brief':      body=header(scope,'Project Brief')+structured(scope)+footer(scope); break;
      case 'minutes':    body=header(scope,'Minutes')+structured(scope)+footer(scope); break;
      case 'cover-p':    body=coverBody(scope,false); break;
      case 'cover-l':    body=coverBody(scope,true); break;
      case 'envelope':   body=envBody(scope); break;
      case 'card':       body=cardBody(); break;
      case 'sig':        body=sigBody(); break;
      default:           body=header(scope,'Document')+structured(scope)+footer(scope);
    }
    download(NAMES[target]||'DreamPath', wrap(body, orient));
    if(window.DPToast) window.DPToast('Saved .doc');
  }

  window.DPExport = { toWord: toWord };
})();
