import { resolveCountryLabelKo } from '../../functions/_shared/country-code-labels.js';
import { resolveCityLabelKo } from '../../functions/_shared/city-name-ko.js';
export function normalizeRows(rows) {
  return (Array.isArray(rows) ? rows : []).map(function (row) {
    const countryCode = row.country_code || '';
    const countryNameOriginal = row.country_name || row.country_code || 'Unknown';
    const cityNameOriginal = row.city_name || '';
    return {
      country_code: countryCode,
      country_name: countryCode === 'ZZ' ? '국가 미확인' : resolveCountryLabelKo(countryCode, countryNameOriginal),
      country_name_original: countryNameOriginal,
      city_name: resolveCityLabelKo(countryCode, cityNameOriginal),
      city_name_original: cityNameOriginal,
      visits: Number(row.visits || 0),
      pageviews: Number(row.pageviews || 0),
      city_count: Number(row.city_count || 0),
      latitude: row.latitude == null ? null : Number(row.latitude),
      longitude: row.longitude == null ? null : Number(row.longitude),
      last_visit_at: row.last_visit_at || '',
    };
  });
}
