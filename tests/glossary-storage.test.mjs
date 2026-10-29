import assert from 'node:assert/strict';
import { storageBucket, SYLLABLE_BUCKETS, MISC_BUCKET, UNMATCHED_BUCKET, isMiscTerm, isUnmatchedTerm } from '../functions/_shared/glossary-buckets.mjs';
for (const bucket of SYLLABLE_BUCKETS) assert.equal(storageBucket(bucket), bucket);
assert.equal(storageBucket(MISC_BUCKET), '가');
assert.equal(storageBucket(UNMATCHED_BUCKET), '가');
assert(isMiscTerm('2급스카우트', '', ''));
assert(isUnmatchedTerm('', 'Scouts de France', ''));
console.log('PASS glossary legacy storage and public inferred categories');
