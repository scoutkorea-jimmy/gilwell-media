/**
 * Gilwell Media · 제16회 한국잼버리 사진 카탈로그
 *
 * 출처: 제16회 한국잼버리 기획조정본부 홍보부 공개 구글드라이브 폴더
 *   https://drive.google.com/drive/folders/19xku4o2OTcxH-LXP9UtQ05mBKraQFe3M
 *
 * ⚠ 만료 주의 — 원본 폴더는 2026-08-17 기준 3개월간만 유지된다고 공지됐다.
 *   따라서 2026-11-17 경 이 핫링크가 일괄 404 로 죽을 수 있다. 그때는
 *   (1) 사진을 R2 로 옮겨 self-host 하거나 (2) 섹션을 내려야 한다.
 *   그 사이에도 갤러리가 깨져 보이지 않도록 jamboree16.js 가 로드 실패를
 *   세어 임계치를 넘으면 섹션 자체를 접는다. GALLERY_EXPIRES_AT 참조.
 *
 * 사용 허가: "한국스카우트연맹 및 스카우트 활동의 홍보를 위한 목적" 허용.
 *   영리·상업적 사용은 사전 문의 대상 — 이 특별관은 홍보 목적에 해당한다.
 *   크레딧은 반드시 표기한다 (jamboree16.html 의 .jam16-gallery-credit).
 *
 * 원본은 장당 8~29MB JPG 라 절대 직결하면 안 된다. 반드시 아래 두 리사이즈
 * 엔드포인트만 쓴다 (둘 다 익명 접근으로 200 검증됨, w1000 기준 약 110KB):
 *   주   경로: https://lh3.googleusercontent.com/d/<ID>=w<px>   ← CDN, 더 빠름
 *   대체 경로: https://drive.google.com/thumbnail?id=<ID>&sz=w<px>
 *
 * 사진 추가/교체 방법: 드라이브에서 파일 ID 를 꺼내 아래 배열에 한 줄 넣는다.
 *   { id: '<드라이브 파일 ID>', day: '<8/5 같은 날짜 라벨>', scene: '<장면 이름>' }
 *   day/scene 은 alt 텍스트와 라이트박스 캡션에 그대로 쓰인다.
 */
(function () {
  'use strict';

  var FOLDER_URL = 'https://drive.google.com/drive/folders/19xku4o2OTcxH-LXP9UtQ05mBKraQFe3M';

  // 원본 폴더 공지상 만료 시점. 이 이후로는 갤러리를 낙관적으로 믿지 않는다.
  var GALLERY_EXPIRES_AT = Date.parse('2026-11-17T00:00:00+09:00');

  // 잼버리 서사 순서대로 큐레이션 — 입영 → 발대식 → 개영식 → 과정활동 →
  // 야간 프로그램 → 폐영식. 랜덤 셔플로 뿌리므로 배열 순서 자체는 표시
  // 순서와 무관하지만, 장면 균형을 눈으로 확인하기 쉽게 묶어 둔다.
  var PHOTOS = [
    // 대회 상징 — 메인 게이트
    { id: '1zVFzqUiL89a3xr7Qa871Lw4Nl5OBdTbF', day: '',    scene: '잼버리 메인 게이트' },
    { id: '1xowMqdluiP3iKV4QuYNP97ByfD5G0kr9', day: '',    scene: '잼버리 메인 게이트 측면' },

    // 8/4 사전일정 — 입영
    { id: '1JAxzXGeaCpOwQ4cW_D0s9XlVDxTYdty3', day: '8/4', scene: '입영' },
    { id: '1haIiB_GgYMfLAls7Rfs85tDoHxJHBE0T', day: '8/4', scene: '입영' },
    { id: '1iMCfdQpDL8u4atls_DHYkY9mYl6mCjFs', day: '8/4', scene: '입영' },
    { id: '1tN05yEQdBGEut8U5yRn2iBiIs3NZbV8D', day: '8/4', scene: '입영' },

    // 8/4 사전일정 — 운영요원 발대식
    { id: '1mmib_6E9njcph6LyOAGVNeKwE_QWq44J', day: '8/4', scene: '운영요원 발대식' },
    { id: '1olohRlA4qkVre31jp2X-88BHKKvsSjO1', day: '8/4', scene: '운영요원 발대식' },
    { id: '1PfqTM5JGtPPRfLKIqZppZeXSzuOdlSe3', day: '8/4', scene: '운영요원 발대식' },
    { id: '13g3rfyTJN9zX3uhqF0XO24qXEfTupFat', day: '8/4', scene: '운영요원 발대식' },

    // 8/5 개영식
    { id: '1bHImnzyNhDASRKoYgo7jEjLhanCwphv2', day: '8/5', scene: '개영식' },
    { id: '1Tbr8u4S-B81GRAanrZ5N7C6gqq9R7joS', day: '8/5', scene: '개영식' },
    { id: '1L5poBpS7CoA6eLJZPWc9R7eJYk6o9EYE', day: '8/5', scene: '개영식' },
    { id: '1kxEknl9J4AfI-eVtzqMTyOvqweMXbsgJ', day: '8/5', scene: '개영식' },
    { id: '1eRu2ocRiDorKOuxYnv8NjAXiE20lkq6q', day: '8/5', scene: '개영식' },
    { id: '1cYBbS3IMr9kkiiq2JvQyHzwP5xZXKjPM', day: '8/5', scene: '개영식' },
    { id: '1GNw2MCdjDMWRTYgjERRC0H9SGDfLjwku', day: '8/5', scene: '개영식' },
    { id: '1obW6UbeDgFzfLeFlOL1eAm6icsMEyfbA', day: '8/5', scene: '개영식' },
    { id: '1wMnXgmkyIz-FxD7AX9hZCfCGNGAWqoos', day: '8/5', scene: '개영식' },
    { id: '1z8_5bDHK5Hwg9g2d9k52AbPaK5qxORs5', day: '8/5', scene: '개영식' },

    // 8/6 과정활동 (영내)
    { id: '1oSWAsWVwDrl4wm0YiRex1U9m3Z5NP1Rj', day: '8/6', scene: '과정활동' },
    { id: '16WmmI26Ab4mKKv0bzMmMb1p9A-wjM6yL', day: '8/6', scene: '과정활동' },
    { id: '1GDjhQX9tPhNXLQO9WpkTNGtF5j3mzTmE', day: '8/6', scene: '과정활동' },
    { id: '1hAzyjH73XgaGiqjuPX86lK2a_ZlytvPP', day: '8/6', scene: '과정활동' },

    // 8/6 케이팝 콘서트
    { id: '1yUK22dgmJUMcM1g-qy9wrLSojto9LyqN', day: '8/6', scene: '케이팝 콘서트' },
    { id: '1vgurnKvY4AYxTvQ-4tHTZV5-eqxETxbb', day: '8/6', scene: '케이팝 콘서트' },
    { id: '1p8BShw_qDMjcP813t1aJoz062SkXyqfJ', day: '8/6', scene: '케이팝 콘서트' },
    { id: '11m6f-xpaxQPW1s03KUNXrcu-3WeYVHEd', day: '8/6', scene: '케이팝 콘서트' },

    // 8/6 폭염대책 워터밤
    { id: '1AReh-BXFaMUou445luRFPpvN00MrNdrR', day: '8/6', scene: '폭염대책 워터밤' },
    { id: '1iSu9GQiscygzvGomIEeTEZcFAzZX4LuO', day: '8/6', scene: '폭염대책 워터밤' },
    { id: '1gqLryipztI4eaXdWbkOx7cGVEyaDTcZq', day: '8/6', scene: '폭염대책 워터밤' },
    { id: '1ry61lseyd5J_7WYTIUwwiM4Nblx49nA5', day: '8/6', scene: '폭염대책 워터밤' },

    // 8/7 과정활동 (수상)
    { id: '1ezE6wDl1ZFv9J5FaW8v56Rmvj8AVrjtV', day: '8/7', scene: '수상 과정활동' },
    { id: '1pvLffSg3PNkcNti1hSxCFSgN59-JSNXa', day: '8/7', scene: '수상 과정활동' },
    { id: '12LJhnEtTKt3jFE4z963fmiVJ_OIpM8KU', day: '8/7', scene: '수상 과정활동' },
    { id: '1xXg7qi2VP_wxUg1QlETwYBy8HkPzeaYg', day: '8/7', scene: '수상 과정활동' },

    // 8/7 슈퍼스타J 본선
    { id: '1MwAjJGxNjYKeb76jwnwbFlM6lZJzCNMu', day: '8/7', scene: '슈퍼스타J 본선' },
    { id: '1_taL1QhI7SbSOU1j9DEY41WyTk2YZa02', day: '8/7', scene: '슈퍼스타J 본선' },
    { id: '1M4ipyRHXezgMNZqBgB790hxhF3MmX5Co', day: '8/7', scene: '슈퍼스타J 본선' },
    { id: '1ykpRwxRJvd3Kg0BHwO-H-fFSQD4oruQe', day: '8/7', scene: '슈퍼스타J 본선' },

    // 8/7 Scouts for Humanity
    { id: '1E-UzD6uCu4E0QwoJoUQ-udIsZ1uac1kt', day: '8/7', scene: 'Scouts for Humanity' },
    { id: '1N8-dxitWxDZs6EYP4HRxLt4qEa5aJrAc', day: '8/7', scene: 'Scouts for Humanity' },
    { id: '1zRv3_dMQZRzSskwJ0Vw_c_mDTyL4CHx3', day: '8/7', scene: 'Scouts for Humanity' },
    { id: '1NNIT7zpkNELYwIFpW-G4elgqVn2UDqBi', day: '8/7', scene: 'Scouts for Humanity' },

    // 8/7 컵스나잇
    { id: '1kvdaolmQ2B0M9kjWiFhmQrRja7567cac', day: '8/7', scene: '컵스나잇' },
    { id: '10FA_sOiU1pY40jyT1J02IDkc29_p2YRH', day: '8/7', scene: '컵스나잇' },
    { id: '1MxQ16jOLnxDMRYiMU9h77bXyblQGSkEl', day: '8/7', scene: '컵스나잇' },
    { id: '17UTCNdRyUeOKP5I472J-3APPF5UGgGwp', day: '8/7', scene: '컵스나잇' },

    // 8/8 폐영식
    { id: '1WYfQgdag32_umWIpi9QR-fSL5w1tQoNq', day: '8/8', scene: '폐영식' },
    { id: '13_S7DiKX0c2UVNMM5cRqIsQwO1P9-cab', day: '8/8', scene: '폐영식' },
    { id: '1cxd8ZyDaH_zcBzjki9OSsLRaAWnqOBdp', day: '8/8', scene: '폐영식' },
    { id: '1JUMXjFWZLlaubvuRtblZAPcOrrc5PR3B', day: '8/8', scene: '폐영식' }
  ];

  window.GW_JAM16_PHOTOS = {
    folderUrl: FOLDER_URL,
    expiresAt: GALLERY_EXPIRES_AT,
    photos: PHOTOS,
    // 썸네일(그리드)과 확대(라이트박스)에 서로 다른 너비를 쓴다.
    thumbUrl: function (id, width) {
      return 'https://lh3.googleusercontent.com/d/' + id + '=w' + (width || 640);
    },
    // 주 경로가 죽었을 때만 쓰는 대체 경로. 같은 파일의 다른 리사이저다.
    fallbackUrl: function (id, width) {
      return 'https://drive.google.com/thumbnail?id=' + id + '&sz=w' + (width || 640);
    },
    viewUrl: function (id) {
      return 'https://drive.google.com/file/d/' + id + '/view';
    }
  };
})();
