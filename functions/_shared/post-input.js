import { queryRust } from './rust-server.js';
import { sanitizeSpecialFeature } from './special-features.js';
import { sanitizeYouTubeUrl } from './youtube.js';

export function requireNonEmptyString(value, fieldLabel, maxLength) {
  if (typeof value !== 'string') {
    return { ok: false, error: `${fieldLabel}은(는) 문자열이어야 합니다.` };
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return { ok: false, error: `${fieldLabel}을(를) 입력해주세요` };
  }
  return {
    ok: true,
    provided: true,
    value: typeof maxLength === 'number' ? trimmed.slice(0, maxLength) : trimmed,
  };
}

export function optionalTrimmedString(value, fieldLabel, maxLength) {
  if (value === undefined) return { ok: true, provided: false, value: undefined };
  if (value === null) return { ok: true, provided: true, value: null };
  if (typeof value !== 'string') {
    return { ok: false, error: `${fieldLabel}은(는) 문자열이어야 합니다.` };
  }
  const trimmed = value.trim();
  return {
    ok: true,
    provided: true,
    value: trimmed ? (typeof maxLength === 'number' ? trimmed.slice(0, maxLength) : trimmed) : null,
  };
}

export function optionalIntegerOrNull(value, fieldLabel) {
  if (value === undefined) return { ok: true, provided: false, value: undefined };
  if (value === null || value === '') return { ok: true, provided: true, value: null };
  if (typeof value === 'number' && Number.isInteger(value)) {
    return { ok: true, provided: true, value };
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = parseInt(value, 10);
    if (Number.isFinite(parsed)) return { ok: true, provided: true, value: parsed };
  }
  return { ok: false, error: `${fieldLabel}은(는) 숫자여야 합니다.` };
}

export function optionalBooleanFlag(value) {
  if (value === undefined) return { ok: true, provided: false, value: undefined };
  if (value === null || value === '') return { ok: true, provided: true, value: 0 };
  if (typeof value === 'boolean') return { ok: true, provided: true, value: value ? 1 : 0 };
  if (typeof value === 'number') return { ok: true, provided: true, value: value === 0 ? 0 : 1 };
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on') {
      return { ok: true, provided: true, value: 1 };
    }
    if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'off') {
      return { ok: true, provided: true, value: 0 };
    }
  }
  return { ok: false, error: '불리언 값이 올바르지 않습니다.' };
}

export function normalizePublishAtInput(publishAt, publishDate) {
  const precise = typeof publishAt === 'string' ? publishAt.trim() : '';
  if (precise) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(precise)) return `${precise} 12:00:00`;
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(precise)) return `${precise.replace('T', ' ')}:00`;
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(precise)) return `${precise}:00`;
    if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}$/.test(precise)) return precise.replace('T', ' ');
    const parsed = Date.parse(precise);
    if (Number.isFinite(parsed)) {
      const shifted = new Date(parsed + (9 * 60 * 60 * 1000));
      return shifted.toISOString().slice(0, 19).replace('T', ' ');
    }
  }
  const fallback = typeof publishDate === 'string' ? publishDate.trim() : '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(fallback)) return `${fallback} 12:00:00`;
  return '';
}

// Validate bounded article text before image uploads or database writes.
export async function validatePostText(env, body, titleRequired) {
  const fields = ['title', 'subtitle', 'tag', 'meta_tags', 'author', 'published', 'featured', 'ai_assisted', 'sort_order'];
  const textFields = new Set(['title', 'subtitle', 'tag', 'meta_tags', 'author']);
  const hasUnpaired = value => /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(value);
  const needsContent = titleRequired || Object.prototype.hasOwnProperty.call(body, 'content');
  const localContent = () => needsContent ? requireNonEmptyString(body.content, '내용') : {ok:true,provided:false};
  const rustContent = needsContent && (typeof body.content !== 'string' || (body.content.length <= 16384 && !hasUnpaired(body.content)));
  const rustFeature = body.special_feature == null || (typeof body.special_feature === 'string' && body.special_feature.length <= 16384);
  const rustYoutube = typeof body.youtube_url !== 'string' || (body.youtube_url.length <= 16384 && !hasUnpaired(body.youtube_url));
  const shortLengths = {image_caption:300, location_name:120, location_address:300};
  const localShort = key => typeof body[key] === 'string' ? (body[key].trim().slice(0, shortLengths[key]) || null) : null;
  const encode = value => {
    if (value === undefined) return {kind:'missing'};
    if (value === null) return {kind:'null'};
    if (typeof value === 'boolean') return {kind:'boolean',boolean:value};
    if (typeof value === 'number') return {kind:'number',number:Number.isFinite(value) ? value : null,zero:value === 0};
    if (typeof value !== 'string') return {kind:'invalid'};
    if (hasUnpaired(value)) return {kind:'units', units:Array.from({length:value.length}, (_, i) => value.charCodeAt(i))};
    return {kind:'text', value};
  };
  const fallback = () => ({
    title: titleRequired || body.title !== undefined ? requireNonEmptyString(body.title, '제목', 200) : {ok:true,provided:false},
    subtitle: optionalTrimmedString(body.subtitle, '부제', 300),
    tag: optionalTrimmedString(body.tag, '태그', 200),
    meta_tags: optionalTrimmedString(body.meta_tags, '메타 태그', 500),
    author: optionalTrimmedString(body.author, '작성자', 60),
    published: optionalBooleanFlag(body.published), featured: optionalBooleanFlag(body.featured),
    ai_assisted: optionalBooleanFlag(body.ai_assisted), sort_order: optionalIntegerOrNull(body.sort_order, '정렬 순서'), publish_at: null, content:localContent(), special_feature:sanitizeSpecialFeature(body.special_feature),
    youtube_url:sanitizeYouTubeUrl(body.youtube_url), ...Object.fromEntries(Object.keys(shortLengths).map(key => [key, localShort(key)])),
  });
  try {
    const input = Object.fromEntries([...fields, 'publish_at', 'publish_date'].map(key => [key, encode(body[key])]));
    if (rustContent) input.content = encode(body.content);
    if (rustFeature) input.special_feature = encode(body.special_feature);
    if (rustYoutube) input.youtube_url = encode(body.youtube_url);
    for (const key of Object.keys(shortLengths)) if (typeof body[key] !== 'string' || body[key].length <= 16384) input[key] = encode(body[key]);
    const response = await queryRust({env,request:{url:'https://internal.invalid/'}}, 'post-text-validate', {...input,title_required:titleRequired});
    if (!response.ok) throw new Error('Rust post text validation failed');
    const output = await response.json();
    if (output?.publish_at !== null && typeof output?.publish_at !== 'string') throw new Error('Invalid publish date validation');
    if (rustContent) {
      const field=output?.content;
      if (!field || typeof field.ok !== 'boolean' || (field.ok && (field.provided !== true || typeof field.value !== 'string' || !field.value)) || (!field.ok && typeof field.error !== 'string')) throw new Error('Invalid post content validation');
    } else output.content = localContent();
    if (rustFeature) {
      const feature=output?.special_feature;
      if (!feature || feature.provided !== (body.special_feature !== undefined) || (feature.provided && feature.value !== null && !Array.isArray(feature.units))) throw new Error('Invalid special feature validation');
      if (!feature.provided) output.special_feature = undefined;
      else if (feature.value === null) output.special_feature = null;
      else {
        if (!feature.units.length || feature.units.length > 120 || feature.units.some(n => !Number.isInteger(n) || n < 0 || n > 65535)) throw new Error('Invalid special feature units');
        output.special_feature = String.fromCharCode(...feature.units);
      }
    } else output.special_feature = sanitizeSpecialFeature(body.special_feature);
    if (!rustYoutube) output.youtube_url = sanitizeYouTubeUrl(body.youtube_url);
    else if (output.youtube_url !== null && (typeof output.youtube_url !== 'string' || !/^https:\/\/www\.youtube\.com\/watch\?v=[A-Za-z0-9_-]{11}$/.test(output.youtube_url))) throw new Error('Invalid YouTube URL validation');
    for (const key of Object.keys(shortLengths)) {
      if (!input[key]) { output[key] = localShort(key); continue; }
      const value=output?.[key];
      if (!value || (value.value !== null && !Array.isArray(value.units))) throw new Error('Invalid post short text');
      if (value.value === null) output[key]=null;
      else {
        if (!value.units.length || value.units.length > shortLengths[key] || value.units.some(n => !Number.isInteger(n) || n < 0 || n > 65535)) throw new Error('Invalid post short text units');
        output[key]=String.fromCharCode(...value.units);
      }
    }
    for (const key of fields) {
      const field = output?.[key];
      if (!field || typeof field.ok !== 'boolean' || (field.ok && typeof field.provided !== 'boolean') || (!field.ok && typeof field.error !== 'string') || (textFields.has(key) && field.ok && field.provided && field.value !== null && field.units === undefined) || (!textFields.has(key) && field.ok && field.provided && field.value !== null && typeof field.value !== 'number') || (key === 'title' && field.ok && field.provided && field.value === null)) throw new Error('Invalid post text validation');
      if (!textFields.has(key) && field.ok && field.provided && ((key === 'sort_order' && field.value !== null && !Number.isInteger(field.value)) || (key !== 'sort_order' && field.value !== 0 && field.value !== 1))) throw new Error('Invalid post numeric validation');
      if (field.units !== undefined) {
        const maximum = {title:200,subtitle:300,tag:200,meta_tags:500,author:60}[key];
        if (!maximum || !Array.isArray(field.units) || field.units.length < 1 || field.units.length > maximum || field.units.some(n => !Number.isInteger(n) || n < 0 || n > 65535)) throw new Error('Invalid post text units');
        field.value = String.fromCharCode(...field.units);
        delete field.units;
      }
    }
    return output;
  } catch (_) { return fallback(); }
}

export function encodePostBindings(values) {
  const unpaired = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
  return values.map(value => typeof value === 'string' && unpaired.test(value)
    ? {__post_utf16: Array.from({length:value.length}, (_, i) => value.charCodeAt(i))}
    : value);
}
