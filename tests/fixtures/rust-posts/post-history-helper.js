export async function recordPostHistory(env, postId, action, beforePost, afterPost, summary) {
  if (!env || !env.DB || !postId) return;
  const legacySnapshot = afterPost || beforePost || null;
  if (!legacySnapshot) return;
  try {
    await env.DB.prepare(
      `INSERT INTO post_history (post_id, action, summary, snapshot, before_snapshot, after_snapshot)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(
      postId,
      String(action || 'update').slice(0, 40),
      summary ? String(summary).slice(0, 200) : null,
      JSON.stringify(legacySnapshot),
      beforePost ? JSON.stringify(beforePost) : null,
      afterPost ? JSON.stringify(afterPost) : null
    ).run();
  } catch (err) {
    console.error('recordPostHistory error:', err);
  }
}

// 두 스냅샷(JSON 직렬화된 post 행)을 비교해 사람이 읽을 수 있는 변경 요약을 만든다.
// 본문은 Editor.js 블록 JSON일 수 있으므로 plain text 길이로 환산해 비교한다.
// LCS 같은 정밀 diff 대신 길이 차분을 쓰는 이유:
//   1) Workers CPU 한계 (10~50ms) — 50개 이력 × 본문 1만자 LCS = 초 단위 소요
//   2) 운영자가 "어떤 글에서 무엇이 얼마나 바뀌었나"만 알면 충분
// 정확한 라인 단위 diff가 필요하면 ?detail=full로 before/after_snapshot을 받아 클라이언트에서 처리.
export function summarizeHistoryDiff(beforeJson, afterJson) {
  let before = null;
  let after = null;
  try { before = beforeJson ? JSON.parse(beforeJson) : null; } catch (_) { before = null; }
  try { after = afterJson ? JSON.parse(afterJson) : null; } catch (_) { after = null; }

  const fields = [];
  if (!before && !after) return { fields };

  const TEXT_FIELDS = [
    { key: 'title', label: '제목' },
    { key: 'subtitle', label: '부제' },
  ];
  TEXT_FIELDS.forEach(function (def) {
    const a = String((before && before[def.key]) || '');
    const b = String((after && after[def.key]) || '');
    if (a === b) return;
    fields.push({
      label: def.label,
      kind: 'text',
      before_len: a.length,
      after_len: b.length,
      delta: b.length - a.length,
    });
  });

  const beforeContent = extractPlain((before && before.content) || '');
  const afterContent = extractPlain((after && after.content) || '');
  if (beforeContent !== afterContent) {
    fields.push({
      label: '본문',
      kind: 'text',
      before_len: beforeContent.length,
      after_len: afterContent.length,
      delta: afterContent.length - beforeContent.length,
    });
  }

  const beforeImage = String((before && before.image_url) || '');
  const afterImage = String((after && after.image_url) || '');
  if (beforeImage !== afterImage) {
    let change = 'changed';
    if (!beforeImage && afterImage) change = 'added';
    else if (beforeImage && !afterImage) change = 'removed';
    fields.push({ label: '대표 이미지', kind: 'flag', change });
  }

  const beforeGallery = parseGalleryCount((before && before.gallery_images) || '');
  const afterGallery = parseGalleryCount((after && after.gallery_images) || '');
  if (beforeGallery !== afterGallery) {
    fields.push({
      label: '갤러리',
      kind: 'count',
      before: beforeGallery,
      after: afterGallery,
      delta: afterGallery - beforeGallery,
    });
  }

  if (((before && before.tag) || '') !== ((after && after.tag) || '')
   || ((before && before.meta_tags) || '') !== ((after && after.meta_tags) || '')) {
    fields.push({ label: '태그', kind: 'flag', change: 'changed' });
  }

  if (((before && before.youtube_url) || '') !== ((after && after.youtube_url) || '')) {
    fields.push({ label: '유튜브', kind: 'flag', change: 'changed' });
  }

  if (((before && before.location_address) || '') !== ((after && after.location_address) || '')
   || ((before && before.location_name) || '') !== ((after && after.location_name) || '')) {
    fields.push({ label: '위치', kind: 'flag', change: 'changed' });
  }

  const beforePub = !!(before && before.published);
  const afterPub = !!(after && after.published);
  if (beforePub !== afterPub) {
    fields.push({ label: '공개 상태', kind: 'flag', change: afterPub ? 'on' : 'off' });
  }

  const beforeFeat = !!(before && before.featured);
  const afterFeat = !!(after && after.featured);
  if (beforeFeat !== afterFeat) {
    fields.push({ label: '메인 스토리', kind: 'flag', change: afterFeat ? 'on' : 'off' });
  }

  const beforePublishAt = String((before && before.publish_at) || '');
  const afterPublishAt = String((after && after.publish_at) || '');
  if (beforePublishAt !== afterPublishAt) {
    fields.push({ label: '예약 공개 시각', kind: 'flag', change: 'changed' });
  }

  return { fields };
}

function extractPlain(str) {
  const raw = String(str || '');
  if (!raw) return '';
  let text = raw;
  if (raw.trim().charAt(0) === '{') {
    try {
      const doc = JSON.parse(raw.trim());
      if (Array.isArray(doc.blocks)) {
        text = doc.blocks.map(function (b) {
          const d = b.data || {};
          if (b.type === 'paragraph' || b.type === 'header' || b.type === 'quote') return d.text || '';
          if (b.type === 'list') return (d.items || []).map(function (i) { return typeof i === 'string' ? i : (i.content || ''); }).join(' ');
          if (b.type === 'image') return d.caption || '';
          if (b.type === 'embed') return d.caption || '';
          return '';
        }).join(' ');
      }
    } catch (_) { /* fall through */ }
  }
  return text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseGalleryCount(raw) {
  if (!raw) return 0;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch (_) { return 0; }
}
