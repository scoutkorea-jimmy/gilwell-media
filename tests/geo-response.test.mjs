import assert from 'node:assert/strict';
import { normalizeRows } from './fixtures/geo-normalize.js';
import { COUNTRY_CODE_LABELS_KO } from '../functions/_shared/country-code-labels.js';
import { GLOBAL_CITY_NAME_KO_MAP,COUNTRY_CITY_NAME_KO_MAP } from '../functions/_shared/city-name-ko.js';
import { queryRust } from '../functions/_shared/rust-server.js';
const rows=[
 {country_code:'KR',country_name:'South Korea',city_name:'Seoul',visits:2,pageviews:3,city_count:1,latitude:0,longitude:0,last_visit_at:'2026-10-01'},
 {country_code:'KR',country_name:'',city_name:'부산 (해운대)',visits:0,pageviews:1,latitude:null,longitude:null},
 {country_code:'ZZ',country_name:null,city_name:'Bogotá',visits:1,pageviews:1},
 {country_code:'JP',country_name:'Japan',city_name:'Ｔｏｋｙｏ',visits:1,pageviews:2},
 {country_code:'XX',country_name:'Example',city_name:'مدينة غريبة',visits:1,pageviews:1},
 {country_code:'',country_name:'',city_name:'\ufeffLondon\ufeff',visits:1,pageviews:1},
 ...Object.keys(COUNTRY_CODE_LABELS_KO).map(code=>({country_code:code,country_name:'Synthetic',city_name:'',visits:1,pageviews:2})),
 ...Object.keys(GLOBAL_CITY_NAME_KO_MAP).map(city=>({country_code:'XX',country_name:'Synthetic',city_name:city,visits:1,pageviews:1})),
 ...Object.entries(COUNTRY_CITY_NAME_KO_MAP).flatMap(([code,cities])=>Object.keys(cities).map(city=>({country_code:code,country_name:'Synthetic',city_name:city,visits:1,pageviews:1}))),
];
const input={range:{startDate:'2026-10-01',endDate:'2026-10-02',label:'기간',days:2},totals:{country_count:2,city_count:3,visits:4,pageviews:5,unknown_country_pageviews:1,missing_coordinate_pageviews:2},countries:rows,cities:rows,countryNames:COUNTRY_CODE_LABELS_KO,globalCities:GLOBAL_CITY_NAME_KO_MAP,countryCities:COUNTRY_CITY_NAME_KO_MAP};
const response=await queryRust({env:{},request:new Request('https://synthetic.invalid/')},'analytics-geo-response',input);
assert.equal(response.status,200);
const result=await response.json();
assert.deepEqual(result.countries,normalizeRows(rows));
assert.deepEqual(result.cities,normalizeRows(rows));
assert.deepEqual(result.summary,{countries:2,cities:3,visits:4,pageviews:5,unknown_country_pageviews:1,missing_coordinate_pageviews:2});
