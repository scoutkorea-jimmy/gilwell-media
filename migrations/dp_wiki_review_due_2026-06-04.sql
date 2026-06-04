-- Document review cycle: next-review date per wiki page. 2026-06-04. Additive.
ALTER TABLE dp_wiki_pages ADD COLUMN review_due TEXT;
