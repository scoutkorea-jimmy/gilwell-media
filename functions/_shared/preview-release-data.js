const GENERIC_CHECKS = [
  {
    id: 'check-home-and-board',
    label: '홈, 기사 상세, 카테고리 보드 주요 흐름을 직접 확인했습니다.',
    description: '공유 버튼 위치, 최신 반영, 게시글 이동, 카드 높이가 자연스러운지 확인합니다.',
  },
  {
    id: 'check-mobile-layout',
    label: '모바일 레이아웃과 주요 상호작용을 확인했습니다.',
    description: '헤더, 버튼, 목록, 모달, 스크롤, 검색, 수정/공유 흐름이 모바일에서도 깨지지 않는지 봅니다.',
  },
  {
    id: 'check-admin-entry',
    label: '관리자 진입과 핵심 관리자 화면을 확인했습니다.',
    description: 'preview 환경에서도 관리자 로그인, 목록, 설정, 편집 흐름이 정상인지 확인합니다.',
  },
  {
    id: 'check-regression',
    label: '이번 변경과 무관한 기존 기능까지 빠르게 회귀 점검했습니다.',
    description: '검색, 용어집, RSS, 대표 기사, 최신/인기/추천 목록 등 핵심 화면을 최소 범위로 다시 확인합니다.',
  },
  {
    id: 'check-release-decision',
    label: '체크리스트를 모두 끝냈고, 지금 상태를 production에 올려도 되는지 최종 판단했습니다.',
    description: '모든 체크를 끝내고 나서만 본 페이지 반영 버튼을 누릅니다.',
  },
];

export function buildPreviewRelease(entry, meta) {
  const version = String(
    (entry && entry.version) ||
    (meta && meta.version) ||
    ''
  ).trim();
  const summary = String(
    (entry && entry.summary) ||
    '현재 preview 릴리스의 변경 사항과 검수 체크리스트를 확인합니다.'
  ).trim();
  const changes = Array.isArray(entry && entry.changes) && entry.changes.length
    ? entry.changes
    : [summary];

  return {
    version: version,
    title: '[프리뷰] V' + version + ' 검수 센터',
    title_prefix: '[프리뷰]',
    summary: summary,
    promotion_note: '모든 체크박스를 완료하고 관리자 인증까지 마친 뒤에만 본 페이지 반영을 시작할 수 있습니다.',
    actions_url: 'https://github.com/scoutkorea-jimmy/gilwell-media/actions',
    commit_sha: String(meta && meta.commit_sha || '').trim(),
    branch: String(meta && meta.branch || 'preview').trim(),
    sections: [
      {
        key: 'updates',
        title: '업데이트 항목',
        items: changes.map(function (change, index) {
          return {
            id: 'update-' + String(index + 1),
            label: String(change || '').trim(),
            description: '이번 preview에 포함된 변경입니다. 실제 화면에서 반영 여부를 확인한 뒤 체크하세요.',
          };
        }),
      },
      {
        key: 'checks',
        title: '검수 체크',
        items: GENERIC_CHECKS,
      },
    ],
  };
}

export function getPreviewChecklistIds(release) {
  return (release && release.sections ? release.sections : []).reduce(function (acc, section) {
    return acc.concat((section.items || []).map(function (item) {
      return item.id;
    }));
  }, []);
}
