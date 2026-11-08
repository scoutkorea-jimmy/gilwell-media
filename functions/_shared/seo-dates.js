export function isoTimestamp(value, naiveZone = 'Z') {
  if (!value) return '';
  let raw = String(value).trim().replace(' ', 'T');
  if (!/(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw)) raw += naiveZone;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}
export function postLastmod(post) {
  const published = isoTimestamp(post.publish_at, '+09:00') || isoTimestamp(post.created_at);
  const updated = isoTimestamp(post.updated_at);
  return [published, updated].filter(Boolean).sort().at(-1) || '';
}
