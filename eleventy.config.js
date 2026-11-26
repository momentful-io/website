import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const icons = {
  menu: 'google-fonts-icons/menu_24dp_E3E3E3_FILL0_wght400_GRAD0_opsz24.svg',
  projects:
    'google-fonts-icons/deployed_code_24dp_E3E3E3_FILL0_wght400_GRAD0_opsz24.svg',
  mission:
    'google-fonts-icons/rocket_launch_24dp_E3E3E3_FILL0_wght400_GRAD0_opsz24.svg',
  arrow:
    'google-fonts-icons/arrow_forward_24dp_E3E3E3_FILL0_wght400_GRAD0_opsz24.svg',
  github: 'ionicons-icons/logo-github.svg',
};
export default function (config) {
  // Fail the build if the local font package is incomplete.
  readFileSync(
    'node_modules/@fontsource-variable/roboto/files/roboto-latin-wght-normal.woff2',
  );
  // Skip Markdown pages marked with `draft: true` (no page, card or sitemap entry).
  config.addPreprocessor('drafts', 'md', (data) => {
    if (data.draft) return false;
  });
  config.addCollection('projects', (collection) =>
    collection
      .getFilteredByGlob('src/projects/*.md')
      .sort(
        (a, b) =>
          (a.data.order ?? 100) - (b.data.order ?? 100) ||
          a.url.localeCompare(b.url),
      ),
  );
  config.addCollection('sitemap', (collection) =>
    collection
      .getAll()
      .filter((item) => item.url && item.url.endsWith('/'))
      .sort((a, b) => a.url.localeCompare(b.url)),
  );
  config.addPassthroughCopy('src/assets');
  config.addShortcode('assetUrl', (filename) => {
    const version = createHash('sha256')
      .update(readFileSync(`src/assets/${filename}`))
      .digest('hex')
      .slice(0, 16);
    return `/assets/${filename}?v=${version}`;
  });
  // Online CMS (GitHub access token sign-in); scripts/prepare-cms.mjs creates cms/vendor.
  config.addPassthroughCopy({
    'cms/editor.html': 'admin/index.html',
    'cms/editor.js': 'admin/editor.js',
    'cms/config.mjs': 'admin/config.js',
    'cms/vendor/sveltia-cms.js': 'admin/sveltia-cms.js',
    'cms/vendor/chunks': 'admin/chunks',
    'cms/vendor/fonts': 'admin/fonts',
    'cms/vendor/LICENSE.txt': 'admin/LICENSE.txt',
  });
  config.addPassthroughCopy({
    'node_modules/@fontsource-variable/roboto/files/roboto-latin-wght-normal.woff2':
      'assets/fonts/roboto-latin.woff2',
    'node_modules/@fontsource-variable/roboto/LICENSE':
      'assets/fonts/LICENSE.txt',
  });
  config.addShortcode('graphic', (name, kind = 'icon') => {
    const path =
      kind === 'logo'
        ? `logos/${name}.svg`
        : `icons/${name === 'chevron' ? 'google-fonts-icons/keyboard_arrow_down_24dp_E3E3E3_FILL0_wght400_GRAD0_opsz24.svg' : icons[name]}`;
    return readFileSync(`src/assets/graphics/${path}`, 'utf8')
      .replace(/<\?xml[^>]*\?>/g, '')
      .replace(
        '<svg',
        `<svg aria-hidden="true" focusable="false" class="${kind}"`,
      );
  });
  return {
    dir: {
      input: 'src',
      includes: '_includes',
      data: '_data',
      output: '_site',
    },
    markdownTemplateEngine: false,
    htmlTemplateEngine: 'njk',
  };
}
