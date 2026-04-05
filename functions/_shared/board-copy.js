export const DEFAULT_BOARD_COPY = Object.freeze({
  latest: {
    description: '최근 30일 동안 한국을 포함한 세계의 스카우트 소식을 한 번에 모아봅니다.',
  },
  korea: {
    description: '국내 스카우트 운동의 소식과 기록을 전합니다.',
  },
  apr: {
    description: '아시아태평양 스카우트 지역의 동향과 소식을 전합니다.',
  },
  wosm: {
    description: '세계스카우트연맹(WOSM)의 글로벌 소식과 동향을 전합니다.',
  },
  people: {
    description: '국내외 스카우트 출신 인물과 활동 중인 스카우트, 먼저 떠난 스카우트 선배들을 조명합니다.',
  },
  glossary: {
    description: '스카우트 용어를 국문·영문·불어 3개 국어 기준으로 정리합니다.',
  },
  calendar: {
    description: '등록된 일정과 행사 정보를 월별로 확인할 수 있습니다.',
  },
  contributors: {
    description: '도움을 주신 모든 분들께 진심으로 감사드립니다.',
  },
  wosm_members: {
    description: 'WOSM 회원국 현황을 한국어와 영어 기준으로 확인하고, 필요한 공개 열은 관리자에서 직접 구성할 수 있습니다. 원본 파일은 `xlsx` 업로드 뒤 열 매핑과 미리보기를 거쳐 불러옵니다.',
  },
});

export function normalizeBoardCopy(raw) {
  let parsed = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch (_) {
      parsed = null;
    }
  }

  const result = {};
  Object.keys(DEFAULT_BOARD_COPY).forEach((key) => {
    const source = parsed && typeof parsed === 'object' ? parsed[key] : null;
    result[key] = {
      description: sanitizeText(source && source.description, DEFAULT_BOARD_COPY[key].description, 600),
    };
  });
  return result;
}

function sanitizeText(value, fallback, maxLen) {
  const text = String(value || '').trim();
  if (!text) return fallback;
  return text.slice(0, maxLen);
}
