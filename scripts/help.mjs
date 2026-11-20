import MarkdownIt from 'markdown-it';
import { posix } from 'node:path';

export const helpFiles = ['README.md'];
export const slug = (text) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
export function renderHelp(
  source,
  {
    browser = true,
    title = 'Momentful I/O – Documentation',
    sourcePath = 'README.md',
  } = {},
) {
  const md = new MarkdownIt();
  md.renderer.rules.heading_open = (tokens, index, options, env, self) => {
    tokens[index].attrSet('id', slug(tokens[index + 1].content));
    return self.renderToken(tokens, index, options);
  };
  const original =
    md.renderer.rules.link_open ||
    ((tokens, index, options, env, self) =>
      self.renderToken(tokens, index, options));
  md.renderer.rules.link_open = (tokens, index, options, env, self) => {
    const href = tokens[index].attrGet('href') || '';
    if (
      browser &&
      href &&
      !href.startsWith('#') &&
      !/^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(href)
    ) {
      const [file, anchor = ''] = href.split('#');
      const target = posix.normalize(
        posix.join(posix.dirname(sourcePath), file),
      );
      if (helpFiles.includes(target))
        tokens[index].attrSet(
          'href',
          '/help/' + target.slice(0, -3) + (anchor ? '#' + anchor : ''),
        );
      if (['LICENSE', 'LICENSE-CONTENT', 'NOTICE'].includes(target))
        tokens[index].attrSet('href', '/legal/' + target);
      if (target === 'src/pages/branding.md')
        tokens[index].attrSet('href', '/branding/');
    }
    return original(tokens, index, options, env, self);
  };
  const body = md.render(source);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${md.utils.escapeHtml(title)}</title><style>body{font:17px/1.6 system-ui;max-width:960px;margin:auto;padding:24px;color:#222;background:#fff}a{color:#613097}code{overflow-wrap:anywhere}pre{overflow:auto;background:#f2f2f2;padding:1em}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:.5em;text-align:left}img{max-width:100%}nav{display:flex;gap:1em;flex-wrap:wrap}</style></head><body><nav><a href="${browser ? '/start/' : 'cms/index.html'}">Start</a><a href="${browser ? '/help/README' : 'README.md'}">README</a></nav>${body}</body></html>`;
}
