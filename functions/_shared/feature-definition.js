// DEFAULT_FEATURE_DEFINITION 은 D1(운영 원본)에서 자동 생성된 fallback 이다.
// 직접 편집하지 말고 scripts/sync_kms_snapshot.mjs 로 재생성한다.
// (과거 이 파일에 1100여 줄 literal 을 인라인하다 D1 과 드리프트했음 — 폰트 규칙·§15~17 누락.)
import { DEFAULT_FEATURE_DEFINITION } from './feature-definition-default.js';
import { singleSetting, queryRust } from './rust-server.js';

export { DEFAULT_FEATURE_DEFINITION };

export function isLegacyFeatureDefinition(value) {
  var text = String(value || '').trim();
  if (!text) return true;
  if (text.indexOf('# Feature Definition') === 0) return true;
  if (text.indexOf('## Calendar') >= 0 && text.indexOf('## Development Rule') >= 0) return true;
  if (text.indexOf('## 0. 문서 목적과 사용 순서') < 0) return true;
  return false;
}

export async function loadFeatureDefinition(env) {
  const row = await singleSetting(env, 'feature_definition');
  const {text:stored,legacy} = await analyzeFeatureDefinitionRust(row && row.value ? String(row.value) : '', env);
  if (!stored || legacy) {
    return DEFAULT_FEATURE_DEFINITION;
  }
  return stored;
}

export function normalizeFeatureDefinitionContent(value) {
  let text = String(value || '');
  if (!text) return '';
  text = text.replace(/\r\n/g, '\n');
  if (text.indexOf('\n') === -1 && /\\n/.test(text)) {
    text = text
      .replace(/\\r\\n/g, '\n')
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\"/g, '"');
  }
  return text;
}


export async function analyzeFeatureDefinitionRust(value, env = {}) {
  const text=normalizeFeatureDefinitionContent(value);
  const original={text,legacy:isLegacyFeatureDefinition(text)};
  try {
    const response=await queryRust({env,request:{url:'https://internal.invalid/'}},'feature-definition-normalize',{text:String(value||'')});
    if(!response.ok) return original;
    const result=await response.json();
    return result.text===text && result.legacy===original.legacy?result:original;
  } catch {return original;}
}
