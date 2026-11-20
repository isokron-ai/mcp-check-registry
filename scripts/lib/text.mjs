// Text helpers for anything that came from outside: issue bodies, repository names, tool names.
// Everything rendered into Markdown goes through these, so submitted text can't add links, images,
// HTML, @mentions or #references to our comments.

/** One line, no control or bidi characters, bounded length. */
export function oneLine(s, max = 200) {
  return String(s ?? '')
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/** Markdown-safe plain text: escapes Markdown and HTML punctuation and breaks @mentions. */
export function mdText(s, max = 200) {
  return oneLine(s, max)
    .replace(/[\\`*_{}\[\]()<>#+!|~^]/g, (c) => '\\' + c)
    .replace(/&/g, '&amp;')
    .replace(/@/g, '@\u200b')
    .replace(/:\/\//g, ':\u200b//')
    .replace(/\bwww\./gi, (m) => m.slice(0, 3) + '\u200b.');
}

/** An inline code span that can't be broken out of, whatever backticks the text holds. */
export function mdCode(s, max = 100) {
  const t = oneLine(s, max);
  const runs = t.match(/`+/g) || [];
  const fence = '`'.repeat(Math.max(0, ...runs.map((r) => r.length)) + 1);
  const pad = t.startsWith('`') || t.endsWith('`') ? ' ' : '';
  return fence + pad + t + pad + fence;
}

/** Appends the registry's UTM tags to an isokron.ai link. */
export function tagged(url, utm) {
  const u = new URL(url);
  for (const [k, v] of Object.entries(utm)) u.searchParams.set(k, v);
  return u.toString();
}
