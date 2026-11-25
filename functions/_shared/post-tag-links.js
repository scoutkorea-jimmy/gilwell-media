export function categoryBoardPath(category) {
  return ['apr', 'korea', 'people', 'wosm'].includes(category) ? '/' + category : '/latest';
}

export function postTagHref(path, filters, tag) {
  const params = new URLSearchParams();
  for (const key of ['sort', 'period', 'days', 'q']) {
    if (filters?.has(key)) params.set(key, filters.get(key));
  }
  if (tag) params.set('tag', tag);
  return path + (params.size ? '?' + params.toString() : '');
}

export function postTagLinks(tags, path, filters) {
  return tags.map(text => ({text, href: postTagHref(path, filters, text)}));
}

export function splitPostTags(csv) {
  return String(csv || '').split(',').map(tag => tag.trim()).filter(Boolean);
}

export function renderPostTagLinks(links, className, escape) {
  return links.map(({text, href}) => `<a class="${className}" href="${escape(href)}">${escape(text)}</a>`).join('');
}
