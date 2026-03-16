const GENERIC_CHECKS = [
  {
    id: 'check-updated-screens',
    label: '이번에 바뀐 화면과 기능을 실제로 하나씩 확인했습니다.',
    description: '업데이트 항목에 나온 변경이 홈, 기사, 게시판, 관리자 등 실제 화면에 반영됐는지 직접 확인합니다.',
  },
  {
    id: 'check-mobile-layout',
    label: '모바일 레이아웃과 주요 상호작용을 확인했습니다.',
    description: '헤더, 버튼, 목록, 모달, 스크롤, 검색, 수정/공유 흐름이 모바일에서도 자연스럽게 동작하는지 봅니다.',
  },
  {
    id: 'check-public-flows',
    label: '공개 페이지의 핵심 흐름을 다시 확인했습니다.',
    description: '홈, 최신 소식, 카테고리 보드, 기사 상세, 검색, RSS 같은 공개 주요 경로를 빠르게 회귀 점검합니다.',
  },
  {
    id: 'check-regression',
    label: '이번 변경과 직접 관련 없는 기존 기능까지 최소 범위로 다시 봤습니다.',
    description: '대표 기사, 인기/추천, 언어 전환, 용어집, 관리자 진입 같은 핵심 축이 같이 깨지지 않았는지 확인합니다.',
  },
  {
    id: 'check-release-decision',
    label: '체크리스트를 모두 끝냈고, 지금 상태를 production에 올려도 되는지 최종 판단했습니다.',
    description: '모든 체크를 끝낸 뒤에만 본 페이지 반영 버튼을 누릅니다.',
  },
];

const DEFAULT_SUMMARY = '현재 preview 릴리스의 변경 사항과 검수 체크리스트를 확인합니다.';
const MAX_RELEASE_SECTIONS = 12;

export function findLatestProductionVersion(deployments) {
  const rows = Array.isArray(deployments) ? deployments : [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    if (String(row.environment || '').toLowerCase() !== 'production') continue;
    const version = String(row.version || '').trim();
    if (version) return version;
  }
  return '';
}

export function collectPendingPreviewEntries(entries, liveVersion) {
  const rows = Array.isArray(entries) ? entries.filter(isChangelogEntry) : [];
  if (!rows.length) return [];

  const baseline = String(liveVersion || '').trim();
  if (!baseline) {
    return rows.slice(0, MAX_RELEASE_SECTIONS);
  }

  const pending = [];
  for (const row of rows) {
    const currentVersion = String(row.version || '').trim();
    if (currentVersion && compareVersions(currentVersion, baseline) <= 0) {
      break;
    }
    pending.push(row);
    if (pending.length >= MAX_RELEASE_SECTIONS) break;
  }

  return pending;
}

export function buildPreviewRelease(entries, meta) {
  const rows = Array.isArray(entries) ? entries.filter(isChangelogEntry) : [];
  const currentVersion = String(
    (meta && meta.version) ||
    (rows[0] && rows[0].version) ||
    ''
  ).trim();
  const liveVersion = String(meta && meta.live_version || '').trim();
  const pendingEntries = collectPendingPreviewEntries(rows, liveVersion);
  const hasPendingChanges = liveVersion
    ? pendingEntries.length > 0
    : rows.length > 0;
  const leadEntry = pendingEntries[0] || rows[0] || null;
  const leadSummary = String((leadEntry && leadEntry.summary) || DEFAULT_SUMMARY).trim();

  const summary = liveVersion
    ? hasPendingChanges
      ? '현재 운영 반영 버전 V' + liveVersion + ' 이후 누적된 ' + pendingEntries.length + '개 릴리스 변경을 검수합니다. 누적 변경 상세와 요청/피드백 히스토리를 함께 확인합니다.'
      : '현재 운영 반영 버전 V' + liveVersion + '와 preview가 같아 아직 추가 수정이나 개발된 사항이 없는 최신 버전입니다.'
    : leadSummary;

  const promotionNote = hasPendingChanges
    ? '모든 체크박스를 완료하고 관리자 인증까지 마친 뒤에만 본 페이지 반영을 시작할 수 있습니다.'
    : '현재 preview에는 production에 아직 반영되지 않은 추가 변경이 없습니다.';

  return {
    version: currentVersion,
    title: '[프리뷰] V' + currentVersion + ' 검수 센터',
    title_prefix: '[프리뷰]',
    summary: summary,
    live_version: liveVersion,
    has_pending_changes: hasPendingChanges,
    pending_versions: pendingEntries.map(function (entry) { return String(entry.version || '').trim(); }).filter(Boolean),
    promotion_note: promotionNote,
    actions_url: 'https://github.com/scoutkorea-jimmy/gilwell-media/actions',
    commit_sha: String(meta && meta.commit_sha || '').trim(),
    branch: String(meta && meta.branch || 'preview').trim(),
    sections: buildSections(pendingEntries, liveVersion, currentVersion, hasPendingChanges),
  };
}

export function getPreviewChecklistIds(release) {
  return (release && release.sections ? release.sections : []).reduce(function (acc, section) {
    return acc.concat((section.items || []).map(function (item) {
      return item && item.id ? item.id : '';
    }).filter(Boolean));
  }, []).filter(Boolean);
}

function buildSections(entries, liveVersion, currentVersion, hasPendingChanges) {
  const releaseSections = [];

  if (!hasPendingChanges) {
    releaseSections.push({
      key: 'up-to-date',
      title: '현재 상태',
      variant: 'notice',
      message: liveVersion
        ? '운영 반영 버전 V' + liveVersion + '와 preview V' + currentVersion + '가 같아서, 아직 새로 검수할 기능적 변경이 없습니다.'
        : '아직 preview에 검수할 변경 이력이 없습니다.',
      detail: '추가 수정이나 개발이 생기면 여기에서 운영 반영본 이후 누적 변경과 요청/피드백 히스토리를 다시 확인할 수 있습니다.',
    });
    return releaseSections;
  }

  if (entries.length) {
    releaseSections.push(buildCumulativeDetailSection(entries));
  }

  const historyItems = buildRequestHistoryItems(entries);
  if (historyItems.length) {
    releaseSections.push({
      key: 'request-history',
      title: '요청 / 피드백 히스토리',
      variant: 'history',
      items: historyItems,
    });
  }

  releaseSections.push({
    key: 'checks',
    title: '검수 체크',
    items: GENERIC_CHECKS,
  });

  return releaseSections;
}

function buildCumulativeDetailSection(entries) {
  return {
    key: 'cumulative-updates',
    title: '운영 반영본 이후 누적 변경 상세',
    items: entries.reduce(function (acc, entry, entryIndex) {
      const version = String(entry.version || '').trim();
      const summary = String(entry.summary || DEFAULT_SUMMARY).trim();
      const changes = Array.isArray(entry.changes) && entry.changes.length
        ? entry.changes
        : [summary];
      return acc.concat(changes.map(function (change, changeIndex) {
        return {
          id: 'update-' + sanitizeVersionId(version || String(entryIndex + 1)) + '-' + String(changeIndex + 1),
          label: String(change || '').trim(),
          description: 'V' + version + ' · ' + summary,
        };
      }));
    }, []),
  };
}

function buildRequestHistoryItems(entries) {
  const aggregated = [];
  entries.forEach(function (entry) {
    const version = String(entry && entry.version || '').trim();
    const summary = String(entry && entry.summary || DEFAULT_SUMMARY).trim();
    const history = Array.isArray(entry && entry.request_history) ? entry.request_history : [];
    if (!history.length) {
      aggregated.push({
        version: version,
        status: 'kept',
        label: 'V' + version + ' · ' + summary,
        description: '이 버전의 변경은 현재 preview 누적 변경 상세에 포함되어 있습니다.',
        feedback: '',
      });
      return;
    }
    history.forEach(function (item, index) {
      const request = String(item && item.request || '').trim();
      const outcome = String(item && item.outcome || '').trim();
      const feedback = String(item && item.feedback || '').trim();
      aggregated.push({
        version: version,
        status: normalizeHistoryStatus(item && item.status),
        label: request || ('V' + version + ' · 요청 히스토리 ' + String(index + 1)),
        description: outcome || ('V' + version + '에서 반영된 요청 흐름입니다.'),
        feedback: feedback,
      });
    });
  });
  return aggregated;
}

function normalizeHistoryStatus(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'removed' || normalized === 'deleted') return 'removed';
  if (normalized === 'changed' || normalized === 'updated') return 'changed';
  return 'kept';
}

function isChangelogEntry(entry) {
  return !!(entry && typeof entry === 'object' && String(entry.version || '').trim());
}

function sanitizeVersionId(value) {
  return String(value || '')
    .trim()
    .replace(/[^0-9a-zA-Z]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'release';
}

function compareVersions(a, b) {
  const left = parseVersionParts(a);
  const right = parseVersionParts(b);
  const max = Math.max(left.length, right.length);
  for (let i = 0; i < max; i += 1) {
    const diff = (left[i] || 0) - (right[i] || 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

function parseVersionParts(value) {
  return String(value || '')
    .split('.')
    .map(function (part) {
      const parsed = parseInt(part, 10);
      return Number.isFinite(parsed) ? parsed : 0;
    });
}
