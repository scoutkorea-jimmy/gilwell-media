import { queryRust } from './rust-server.js';
import { getCountryNameAliases, isCountryNameFallbackValue, translateCountryNameToKorean } from './country-name-ko.js';

const BASE_ITEM_KEYS = new Set([
  'country_ko',
  'country_en',
  'country_fr',
  'membership_category',
  'status_description',
  'sort_order',
  'extra_fields',
]);

const DEFAULT_COLUMNS = [
  { key: 'country_names', label: '국가명', type: 'country_names', system: true, default_header: '' },
  { key: 'membership_category', label: '회원 자격', type: 'field', system: true, default_header: 'WOSM membership category' },
  { key: 'status_description', label: '상태 설명', type: 'field', system: true, default_header: 'Status description' },
];
const REQUIRED_COLUMN_KEYS = new Set(['country_names']);

export const DEFAULT_WOSM_MEMBERS = {
  items: [],
  columns: DEFAULT_COLUMNS,
  import_mapping: {
    country_ko: '',
    country_en: 'Country Name option 1 E',
    country_fr: 'Country Name option 1 F',
  },
  registered_count: 176,
  public_copy: {
    overview_template: '{countryCount}개국 · {memberCount}개 회원연맹을 {viewLabel} 기준으로 정리했습니다. {collapsibleCount}개국은 {childLabel}을 접어둘 수 있습니다.',
    search_template: '검색 결과 {countryCount}개국 · {memberCount}개 회원연맹이 {viewLabel} 기준으로 표시됩니다.',
    section_meta_template: '{countryCount}개국 · {memberCount}개 회원연맹',
    helper_text: '대표 연맹을 먼저 보고, 같은 국가의 소속 회원연맹은 필요할 때 펼쳐볼 수 있습니다. 검색 결과에 하위 연맹이 포함되면 해당 그룹은 자동으로 펼쳐집니다.',
    child_label: '소속 회원연맹',
    section_region_label: '지역연맹',
    section_language_label: '공식 언어',
  },
  revision: 0,
};

export function sanitizeWosmMembersItems(raw) {
  const items = Array.isArray(raw) ? raw : [];
  return items
    .map((item, index) => sanitizeWosmMemberItem(item, index))
    .filter((item) => item.country_en || item.country_fr || item.country_ko);
}

export function sanitizeWosmMemberItem(item, index) {
  const source = item && typeof item === 'object' ? item : {};
  const extraSource = source.extra_fields && typeof source.extra_fields === 'object' ? source.extra_fields : {};
  const unknownTopLevel = {};
  Object.keys(source).forEach((key) => {
    if (!BASE_ITEM_KEYS.has(key)) unknownTopLevel[key] = source[key];
  });
  const countryEn = sanitizeText(source.country_en, 160);
  const translatedKo = translateCountryNameToKorean(countryEn);
  const rawCountryKo = sanitizeText(source.country_ko, 120);
  const countryKo = isCountryNameFallbackValue(rawCountryKo, countryEn)
    ? (translatedKo || countryEn)
    : rawCountryKo;
  return {
    country_ko: countryKo,
    country_en: countryEn,
    country_fr: sanitizeText(source.country_fr, 160),
    membership_category: sanitizeText(source.membership_category, 160),
    status_description: sanitizeText(source.status_description, 260),
    extra_fields: sanitizeExtraFields(Object.assign({}, unknownTopLevel, extraSource)),
    sort_order: Number.isFinite(Number(source.sort_order)) ? Number(source.sort_order) : index,
  };
}

export async function sanitizeWosmMembersItemsRust(raw, env = {}, run = queryRust, withAliases = false) {
  const fallback = () => withAliases ? null : sanitizeWosmMembersItems(raw);
  try {
    const items = (Array.isArray(raw)?raw:[]).map(item=>{
      const source=item && typeof item==='object' ? item : {};
      const extraSource=source.extra_fields && typeof source.extra_fields==='object' ? source.extra_fields : {};
      const unknown={}; Object.keys(source).forEach(key=>{if (!BASE_ITEM_KEYS.has(key)) unknown[key]=source[key];});
      const en=String(source.country_en || '');
      const extras=Object.entries(Object.assign({},unknown,extraSource)).map(([key,value])=>[key,String(value || '')]);
      const order=Number(source.sort_order);
      return {ko:String(source.country_ko||''),en,fr:String(source.country_fr||''),membership:String(source.membership_category||''),status:String(source.status_description||''),extras,order:Number.isFinite(order)?order:null};
    });
    if (/\\u[dD][89a-fA-F][0-9a-fA-F]{2}/.test(JSON.stringify(items))) return fallback();
    const response=await run({env,request:{url:'https://internal.invalid/'}},withAliases ? 'wosm-members-response' : 'wosm-members-normalize',{items});
    if (!response.ok) return fallback();
    const result=await response.json(); if (!Array.isArray(result.items) || result.items.length > items.length) return fallback();
    const decode=units=>{if (!Array.isArray(units) || units.length>260 || !units.every(n=>Number.isInteger(n)&&n>=0&&n<=65535)) throw new Error('invalid member text'); return String.fromCharCode(...units);};
    const output=result.items.map(item=>{
      if (!Array.isArray(item.extras) || typeof item.order!=='number' || !Number.isFinite(item.order)) throw new Error('invalid member');
      const extras={}; for(const [key,units] of item.extras) {if(typeof key!=='string') throw new Error('invalid key'); extras[key]=decode(units);}
      return {country_ko:decode(item.ko),country_en:decode(item.en),country_fr:decode(item.fr),membership_category:decode(item.membership),status_description:decode(item.status),extra_fields:extras,sort_order:item.order};
    });
    if (withAliases) {
      if (!Array.isArray(result.aliases) || result.aliases.length !== output.length || !result.aliases.every(list =>
        Array.isArray(list) && new Set(list).size === list.length && list.every(value => typeof value === 'string' && value.length > 0 && value === value.trim())
      )) return fallback();
      return {items:output, aliases:result.aliases};
    }
    return output;
  } catch {return fallback();}
}

export function parseWosmMembersPayload(rawValue) {
  try {
    const parsed = rawValue ? JSON.parse(rawValue) : [];
    return sanitizeWosmMembersItems(parsed);
  } catch {
    return [];
  }
}

export function normalizeWosmImportMapping(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    country_ko: sanitizeText(source.country_ko, 160),
    country_en: sanitizeText(source.country_en, 160) || DEFAULT_WOSM_MEMBERS.import_mapping.country_en,
    country_fr: sanitizeText(source.country_fr, 160) || DEFAULT_WOSM_MEMBERS.import_mapping.country_fr,
  };
}

export function parseWosmImportMapping(rawValue) {
  try {
    const parsed = rawValue ? JSON.parse(rawValue) : {};
    return normalizeWosmImportMapping(parsed);
  } catch {
    return normalizeWosmImportMapping({});
  }
}

export function normalizeWosmMembersColumns(raw) {
  const source = Array.isArray(raw) ? raw : [];
  if (!source.length) return DEFAULT_COLUMNS.map((column) => ({ ...column }));
  const seen = new Set();
  const result = [];
  source.forEach((column, index) => {
    const normalized = sanitizeWosmMembersColumn(column, index);
    if (!normalized || seen.has(normalized.key)) return;
    seen.add(normalized.key);
    result.push(normalized);
  });

  DEFAULT_COLUMNS.forEach((column) => {
    const existingIndex = result.findIndex((item) => item.key === column.key);
    if (existingIndex >= 0) {
      result[existingIndex] = {
        ...result[existingIndex],
        label: sanitizeText(result[existingIndex].label, 40) || column.label,
        type: column.type,
        system: true,
        default_header: column.key === 'country_names'
          ? ''
          : sanitizeText(result[existingIndex].default_header, 160) || column.default_header,
      };
      return;
    }
    if (REQUIRED_COLUMN_KEYS.has(column.key)) {
      seen.add(column.key);
      result.push({ ...column });
    }
  });

  return prioritizeWosmColumns(result);
}

export async function normalizeWosmMembersColumnsRust(raw, env = {}, run = queryRust) {
  const fallback = () => normalizeWosmMembersColumns(raw);
  try {
    const columns = (Array.isArray(raw)?raw:[]).map(column=>{
      const source=column && typeof column === 'object' ? column : {};
      return [String(source.key || ''),String(source.label || ''),String(source.default_header || '')];
    });
    const defaults=DEFAULT_COLUMNS.map(c=>[c.key,c.label,c.type,c.default_header]);
    if (/\\u[dD][89a-fA-F][0-9a-fA-F]{2}/.test(JSON.stringify(columns))) return fallback();
    const response=await run({env,request:{url:'https://internal.invalid/'}},'wosm-columns-normalize',{columns,defaults});
    if (!response.ok) return fallback();
    const result=await response.json();
    if (!Array.isArray(result.columns)) return fallback();
    const validUnits=units=>Array.isArray(units) && units.length<=160 && units.every(n=>Number.isInteger(n)&&n>=0&&n<=65535);
    const output=[];
    for (const c of result.columns) {
      if (!c || typeof c.key!=='string' || typeof c.type!=='string' || typeof c.system!=='boolean' || !validUnits(c.label) || !validUnits(c.header)) return fallback();
      output.push({key:c.key,label:String.fromCharCode(...c.label),type:c.type,system:c.system,default_header:String.fromCharCode(...c.header)});
    }
    const keys = output.map(c => c.key);
    if (new Set(keys).size !== keys.length || !keys.includes('country_names') || !output.every(c => {
      const system = ['country_names','membership_category','status_description'].includes(c.key);
      return /^[a-z0-9_]{1,40}$/.test(c.key) && c.label.length > 0 && c.label.length <= 40 &&
        c.default_header.length <= 160 && c.system === system && c.type === (c.key === 'country_names' ? 'country_names' : 'field') &&
        (c.key !== 'country_names' || c.default_header === '');
    })) return fallback();
    return output;
  } catch {return fallback();}
}

export function parseWosmMembersColumns(rawValue) {
  try {
    const parsed = rawValue ? JSON.parse(rawValue) : [];
    return normalizeWosmMembersColumns(parsed);
  } catch {
    return normalizeWosmMembersColumns([]);
  }
}

export function normalizeWosmRegisteredCount(value) {
  if (value === null || typeof value === 'undefined' || String(value).trim() === '') {
    return DEFAULT_WOSM_MEMBERS.registered_count;
  }
  var num = Number(value);
  if (!Number.isFinite(num) || num < 0) return DEFAULT_WOSM_MEMBERS.registered_count;
  return Math.round(num);
}

export function normalizeWosmMembersResponse(items, columns, importMapping, registeredCount, revision, publicCopy) {
  const normalizedItems = sanitizeWosmMembersItems(items).map((item) => ({
    ...item,
    country_aliases: buildWosmCountryAliases(item),
  }));
  return {
    items: normalizedItems,
    columns: normalizeWosmMembersColumns(columns),
    import_mapping: normalizeWosmImportMapping(importMapping),
    registered_count: normalizeWosmRegisteredCount(registeredCount),
    public_copy: normalizeWosmPublicCopy(publicCopy),
    revision: Number.isFinite(Number(revision)) ? Number(revision) : 0,
  };
}

export async function normalizeWosmMembersResponseRust(items, columns, importMapping, registeredCount, revision, publicCopy, env = {}, run = queryRust) {
  const fallback = () => normalizeWosmMembersResponse(items, columns, importMapping, registeredCount, revision, publicCopy);
  try {
    const combined = await sanitizeWosmMembersItemsRust(items, env, run, true);
    if (!combined) return fallback();
    const normalizedItems = combined.items;
    return {
      items: normalizedItems.map((item,index) => ({...item, country_aliases:combined.aliases[index]})),
      columns: normalizeWosmMembersColumns(columns),
      import_mapping: normalizeWosmImportMapping(importMapping),
      registered_count: normalizeWosmRegisteredCount(registeredCount),
      public_copy: normalizeWosmPublicCopy(publicCopy),
      revision: Number.isFinite(Number(revision)) ? Number(revision) : 0,
    };
  } catch { return fallback(); }
}

function buildWosmCountryAliases(item) {
  const aliases = new Set();
  const addAlias = (value) => {
    const text = String(value || '').trim();
    if (!text) return;
    aliases.add(text);
  };
  addAlias(item && item.country_ko);
  addAlias(item && item.country_en);
  addAlias(item && item.country_fr);
  const translatedKo = translateCountryNameToKorean(item && item.country_en);
  addAlias(translatedKo);
  getCountryNameAliases(item && item.country_en).forEach(addAlias);
  getCountryNameAliases(item && item.country_ko).forEach(addAlias);

  return Array.from(aliases);
}

export function normalizeWosmPublicCopy(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const defaults = DEFAULT_WOSM_MEMBERS.public_copy;
  return {
    overview_template: sanitizeText(source.overview_template, 320) || defaults.overview_template,
    search_template: sanitizeText(source.search_template, 240) || defaults.search_template,
    section_meta_template: sanitizeText(source.section_meta_template, 120) || defaults.section_meta_template,
    helper_text: sanitizeText(source.helper_text, 360) || defaults.helper_text,
    child_label: sanitizeText(source.child_label, 40) || defaults.child_label,
    section_region_label: sanitizeText(source.section_region_label, 30) || defaults.section_region_label,
    section_language_label: sanitizeText(source.section_language_label, 30) || defaults.section_language_label,
  };
}

export async function normalizeWosmFieldsRust(mappingRaw, copyRaw, countRaw, env = {}, run = queryRust) {
  const fallback = () => ({mapping:normalizeWosmImportMapping(mappingRaw),copy:normalizeWosmPublicCopy(copyRaw),count:normalizeWosmRegisteredCount(countRaw)});
  try {
    const mapping = mappingRaw && typeof mappingRaw === 'object' ? mappingRaw : {};
    const copy = copyRaw && typeof copyRaw === 'object' ? copyRaw : {};
    const specs = [
      ...Object.keys(DEFAULT_WOSM_MEMBERS.import_mapping).map(key=>['m:'+key,mapping[key],DEFAULT_WOSM_MEMBERS.import_mapping[key],160]),
      ...[['overview_template',320],['search_template',240],['section_meta_template',120],['helper_text',360],['child_label',40],['section_region_label',30],['section_language_label',30]].map(([key,max])=>['c:'+key,copy[key],DEFAULT_WOSM_MEMBERS.public_copy[key],max]),
    ];
    const fields = specs.map(([key,value,fallback,max])=>[key,String(value || ''),fallback,max]);
    const countEmpty = countRaw == null || String(countRaw).trim() === '';
    const count = countEmpty ? null : Number(countRaw);
    if (/\\u[dD][89a-fA-F][0-9a-fA-F]{2}/.test(JSON.stringify(fields))) return fallback();
    const response = await run({env,request:{url:'https://internal.invalid/'}},'wosm-fields-normalize',{fields,count:Number.isFinite(count)?count:null,count_empty:countEmpty});
    if (!response.ok) return fallback();
    const output = await response.json();
    if (!Array.isArray(output.fields) || output.fields.length !== specs.length || typeof output.registered_count !== 'number' || !Number.isFinite(output.registered_count) || output.registered_count < 0 || !Number.isInteger(output.registered_count)) return fallback();
    const result = {mapping:{},copy:{},count:output.registered_count};
    for (let i=0;i<specs.length;i++) {
      const [key,units] = output.fields[i] || [];
      if (key !== specs[i][0] || !Array.isArray(units) || units.length>specs[i][3] && units.length>specs[i][2].length || !units.every(n=>Number.isInteger(n)&&n>=0&&n<=65535)) return fallback();
      result[key.startsWith('m:')?'mapping':'copy'][key.slice(2)] = String.fromCharCode(...units);
    }
    return result;
  } catch { return fallback(); }
}

export function parseWosmPublicCopy(rawValue) {
  try {
    const parsed = rawValue ? JSON.parse(rawValue) : {};
    return normalizeWosmPublicCopy(parsed);
  } catch {
    return normalizeWosmPublicCopy({});
  }
}

function sanitizeWosmMembersColumn(column, index) {
  const source = column && typeof column === 'object' ? column : {};
  const rawKey = String(source.key || '').trim();
  const fallbackKey = 'column_' + String(index + 1);
  const key = sanitizeColumnKey(rawKey || fallbackKey);
  if (!key) return null;
  const system = key === 'country_names' || key === 'membership_category' || key === 'status_description';
  return {
    key,
    label: sanitizeText(source.label, 40) || key,
    type: key === 'country_names' ? 'country_names' : 'field',
    system,
    default_header: key === 'country_names' ? '' : sanitizeText(source.default_header, 160),
  };
}

function sanitizeExtraFields(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const result = {};
  Object.keys(source).forEach((key) => {
    const sanitizedKey = sanitizeColumnKey(key);
    if (!sanitizedKey || BASE_ITEM_KEYS.has(sanitizedKey)) return;
    result[sanitizedKey] = sanitizeText(source[key], 260);
  });
  return result;
}

function sanitizeColumnKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

function prioritizeWosmColumns(columns) {
  const list = Array.isArray(columns) ? columns.slice() : [];
  const sortColumns = [];
  const others = [];
  list.forEach((column) => {
    if (isSortPriorityColumn(column)) sortColumns.push(column);
    else others.push(column);
  });
  return sortColumns.concat(others);
}

function isSortPriorityColumn(column) {
  const key = String(column && column.key || '').toLowerCase();
  const label = String(column && column.label || '').toLowerCase();
  const header = String(column && column.default_header || '').toLowerCase();
  return key.includes('sort')
    || label.includes('정렬')
    || label.includes('순번')
    || header.includes('strict order');
}

function sanitizeText(value, maxLen) {
  return String(value || '').trim().slice(0, maxLen);
}
