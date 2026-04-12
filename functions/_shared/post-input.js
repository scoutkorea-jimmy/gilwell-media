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
  return { ok: true, provided: true, value: value ? 1 : 0 };
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
