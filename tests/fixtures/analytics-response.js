export function buildAnalyticsResponse({range, useHourlySeries, todayVisits, todayViews, totalPosts, publishedPosts, totalVisits, totalViews, averageDwellSeconds, seriesData, topPaths, topArticlePosts, popularPostDwellRow, referrerSummary, heatmap, tagSummary}) {
  const visitSeries = seriesData.visit_series;
  const viewSeries = seriesData.view_series;
  const rangeVisits = seriesData.unique;
  const rangeViews = seriesData.range_views;
  return {
    provider: 'site_visits',
    provider_label: '공개 페이지 전체 방문 집계',
    range: {
      start_date: range.startDate,
      end_date: range.endDate,
      label: range.label,
      days: range.days,
      granularity: useHourlySeries ? 'hour' : 'day',
    },
    today: {
      visits: todayVisits,
      views: todayViews,
    },
    counts: {
      total: totalPosts,
      published: publishedPosts,
    },
    summary: {
      today_visits: todayVisits,
      today_pageviews: todayViews,
      today_views: todayViews,
      total_visits: totalVisits,
      range_visits: rangeVisits,
      total_pageviews: totalViews,
      range_pageviews: rangeViews,
      average_dwell_seconds: averageDwellSeconds,
      popular_post_average_dwell_seconds: Number(popularPostDwellRow && popularPostDwellRow.avg_dwell_seconds || 0),
      popular_post_title: popularPostDwellRow && popularPostDwellRow.title ? popularPostDwellRow.title : '',
      average_daily_visits: seriesData.average_daily_visits,
      average_daily_pageviews: seriesData.average_daily_pageviews,
    },
    visitors: {
      today_visits: todayVisits,
      total_visits: totalVisits,
      range_visits: rangeVisits,
      series: visitSeries,
    },
    views: {
      total: rangeViews,
      total_pageviews: totalViews,
      range_pageviews: rangeViews,
      series: viewSeries,
      top_paths: (topPaths.results || []).map((item) => ({
        path: item.path || '/',
        title: item.title || '',
        visits: item.visits || 0,
        pageviews: item.pageviews || 0,
        avg_dwell_seconds: Number(item.avg_dwell_seconds || 0),
      })),
    },
    top_paths: (topPaths.results || []).map((item) => ({
      path: item.path || '/',
      title: item.title || '',
      visits: item.visits || 0,
      pageviews: item.pageviews || 0,
      avg_dwell_seconds: Number(item.avg_dwell_seconds || 0),
    })),
    top_posts: (topPaths.results || []).map((item) => ({
      path: item.path || '/',
      title: item.title || item.path || '제목 없음',
      views: item.pageviews || 0,
      visits: item.visits || 0,
      avg_dwell_seconds: Number(item.avg_dwell_seconds || 0),
    })),
    article_top_posts: (topArticlePosts.results || []).map((item) => ({
      path: item.path || '/',
      title: item.title || item.path || '제목 없음',
      views: item.pageviews || 0,
      visits: item.visits || 0,
      avg_dwell_seconds: Number(item.avg_dwell_seconds || 0),
    })),
    referrers: referrerSummary.referrers,
    sources: referrerSummary.sources,
    heatmap,
    tags: tagSummary,
    tracking_note: `${range.label} 기준 공개 페이지 전체 방문 집계입니다. 방문 수는 고유 사용자 수, 조회수는 전체 페이지뷰 수 기준입니다. 평균 체류시간은 현재 기사 상세 페이지(post)에서만 활성 시간 기준으로 계산됩니다. 유입 경로는 공유 링크 UTM과 site_visits의 referrer URL을 함께 사용해 카카오, 페이스북, 검색, 내부 이동 등을 최대한 세분화해 보여주지만, 메신저 앱이나 인앱 브라우저가 정보를 넘기지 않으면 직접 방문으로 기록될 수 있습니다.`,
  };
}
