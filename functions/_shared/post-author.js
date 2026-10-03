export function publicAuthor(value) {
  const name = String(value || '').trim();
  if (!name || /^(?:불러오는 중[.…]*|loading[.…]*)$/i.test(name)) return 'BP미디어';
  return name.replace(/^Editor[ .]+([A-Z])$/i, (_, letter) => 'Editor.' + letter.toUpperCase());
}
export function isPlaceholderAuthor(value) {
  return /^(?:불러오는 중[.…]*|loading[.…]*)$/i.test(String(value || '').trim());
}
