export const DEFAULT_CALENDAR_COPY = {
  page_title: '일정 캘린더',
  page_description: '등록된 일정과 행사 정보를 월별로 확인할 수 있습니다.',
  month_view_label: '월간 일정보기',
  month_view_summary: '월간 일정보기입니다. 여러 날 이어지는 일정은 막대형으로 표시됩니다.',
  year_view_label: '연간 일정보기',
  year_view_summary: '연간 일정보기입니다. 월별로 정렬된 일정을 한 번에 확인할 수 있습니다.',
  today_button_label: '오늘로 가기',
  add_event_label: '일정 추가',
  status_panel_label: '상태별 일정',
  ongoing_label: '진행중',
  upcoming_label: '개최예정',
  finished_label: '행사종료',
  ongoing_empty: '진행중인 일정이 없습니다.',
  upcoming_empty: '선택한 달 기준 3개월 안에 예정된 일정이 없습니다.',
  finished_empty: '선택한 달 기준 최근 3개월 안에 종료된 일정이 없습니다.',
  map_title: '캘린더 지도',
  map_help: '축소 시 국가 단위로 묶이고, 확대할수록 세부 행사 위치를 볼 수 있습니다.',
};

function normalizeCalendarCopy(input) {
  const next = {};
  Object.keys(DEFAULT_CALENDAR_COPY).forEach((key) => {
    const value = String(input && input[key] || '').trim();
    next[key] = value || DEFAULT_CALENDAR_COPY[key];
  });
  return next;
}

export async function loadCalendarCopy(env) {
  const row = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'calendar_copy'`).first();
  if (!row || !row.value) return { ...DEFAULT_CALENDAR_COPY };
  try {
    return normalizeCalendarCopy(JSON.parse(row.value));
  } catch (_) {
    return { ...DEFAULT_CALENDAR_COPY };
  }
}

export function sanitizeCalendarCopy(input) {
  return normalizeCalendarCopy(input);
}
