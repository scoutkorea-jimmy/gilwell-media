#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DEFAULT_NAV_LABELS, NAV_ITEMS } from '../functions/_shared/site-structure.mjs';
import { DEFAULT_TICKER_ITEMS } from '../functions/_shared/site-copy.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const PUBLIC_HTML_FILES = [
  'index.html',
  'latest.html',
  'korea.html',
  'apr.html',
  'wosm.html',
  'wosm-members.html',
  'people.html',
  'glossary.html',
  'contributors.html',
  'search.html',
  'calendar.html',
];

const NAV_FALLBACK_BY_HREF = new Map(
  NAV_ITEMS.map((item) => [item.href, (DEFAULT_NAV_LABELS[item.key] && DEFAULT_NAV_LABELS[item.key].ko) || item.key])
);

for (const relativePath of PUBLIC_HTML_FILES) {
  const fullPath = path.join(ROOT_DIR, relativePath);
  let html = fs.readFileSync(fullPath, 'utf8');

  html = html.replace(
    /(<a\b[^>]*href="([^"]+)"[^>]*data-i18n="([^"]+)"[^>]*data-fallback-label=")([^"]*)(")/g,
    (match, prefix, href, key, current, suffix) => {
      const fallback = NAV_FALLBACK_BY_HREF.get(href) || (DEFAULT_NAV_LABELS[key] && DEFAULT_NAV_LABELS[key].ko) || current;
      return prefix + escapeHtmlAttribute(fallback) + suffix;
    }
  );

  html = html.replace(
    /(<h3\b[^>]*data-i18n="([^"]+)"[^>]*data-managed-home-label[^>]*data-fallback-label=")([^"]*)(")/g,
    (match, prefix, key, current, suffix) => {
      const fallback = (DEFAULT_NAV_LABELS[key] && DEFAULT_NAV_LABELS[key].ko) || current;
      return prefix + escapeHtmlAttribute(fallback) + suffix;
    }
  );

  if (relativePath === 'index.html') {
    html = html.replace(
      /(id="ticker-inner"[^>]*data-fallback-items=")([^"]*)(")/,
      (match, prefix, current, suffix) => prefix + escapeHtmlAttribute(DEFAULT_TICKER_ITEMS.join('||')) + suffix
    );
  }

  fs.writeFileSync(fullPath, html);
}

function escapeHtmlAttribute(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;');
}
