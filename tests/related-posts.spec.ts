import { test, expect } from '@playwright/test';
import { extractRelatedTerms } from '../functions/_shared/related-posts.js';

test('related-post terms split hashtag lists into bounded literal tokens', () => {
  const raw = '#세계스카우트연맹 #세계스카우트운동 #DialogueForPeace ' + 'x'.repeat(80) + ' 100%_safe';
  const terms = Array.from(extractRelatedTerms('소식,베트남연맹', raw));

  expect(terms).toContain('세계스카우트연맹');
  expect(terms).toContain('dialogueforpeace');
  expect(terms).toContain('100safe');
  expect(terms).not.toContain('x'.repeat(80));
  expect(terms.every((term) => term.length >= 2 && term.length <= 64)).toBe(true);
});
