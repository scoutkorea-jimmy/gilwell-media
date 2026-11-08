import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import worker from '../workers/card-news-weekly.js';

const unexpected = () => { throw new Error('Disabled scheduled creation must not access data or queue work'); };
const env = new Proxy({}, { get: unexpected });
await worker.scheduled({ scheduledTime: Date.parse('2026-10-25T15:00:00Z') }, env, { waitUntil: unexpected });
assert.match(readFileSync(new URL('../wrangler.card-news-weekly.toml', import.meta.url), 'utf8'), /^crons = \[\]$/m);
console.log('PASS: no configured card-news cron; scheduled events do not access data or queue work');
