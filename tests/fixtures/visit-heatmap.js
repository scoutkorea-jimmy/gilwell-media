export function buildVisitHeatmap(rows, publishRows, range) {
  const weekdays = [
    { key: 1, label: '월' },
    { key: 2, label: '화' },
    { key: 3, label: '수' },
    { key: 4, label: '목' },
    { key: 5, label: '금' },
    { key: 6, label: '토' },
    { key: 0, label: '일' },
  ];
  const byKey = new Map();
  const publishByKey = new Map();
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const weekday = Number(row.weekday);
    const hour = String(row.visit_hour || '').padStart(2, '0');
    byKey.set(weekday + '-' + hour, {
      visits: Number(row.visits || 0),
      pageviews: Number(row.pageviews || 0),
    });
  });
  (Array.isArray(publishRows) ? publishRows : []).forEach((row) => {
    const weekday = Number(row.weekday);
    const hour = String(row.publish_hour || '').padStart(2, '0');
    publishByKey.set(weekday + '-' + hour, Number(row.publish_count || 0));
  });
  const cells = [];
  let maxVisits = 0;
  let maxPublishCount = 0;
  weekdays.forEach((day) => {
    for (let hour = 0; hour < 24; hour += 1) {
      const hourKey = String(hour).padStart(2, '0');
      const found = byKey.get(day.key + '-' + hourKey) || { visits: 0, pageviews: 0 };
      const publishCount = Number(publishByKey.get(day.key + '-' + hourKey) || 0);
      maxVisits = Math.max(maxVisits, Number(found.visits || 0));
      maxPublishCount = Math.max(maxPublishCount, publishCount);
      cells.push({
        weekday: day.key,
        weekday_label: day.label,
        hour: hourKey,
        visits: Number(found.visits || 0),
        pageviews: Number(found.pageviews || 0),
        publish_count: publishCount,
      });
    }
  });
  cells.forEach((cell) => {
    const ratio = maxVisits > 0 ? cell.visits / maxVisits : 0;
    cell.intensity = Number(ratio.toFixed(4));
    const publishRatio = maxPublishCount > 0 ? cell.publish_count / maxPublishCount : 0;
    cell.publish_intensity = Number(publishRatio.toFixed(4));
  });
  return {
    range_label: range && range.label ? range.label : '',
    max_visits: maxVisits,
    max_publish_count: maxPublishCount,
    weekdays: weekdays,
    hours: Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, '0')),
    cells,
  };
}
