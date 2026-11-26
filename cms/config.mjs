const hidden = (name, value) => ({ name, widget: 'hidden', default: value });
const text = (name, label, extra = {}) => ({
  name,
  label,
  widget: 'string',
  ...extra,
});
const body = {
  name: 'body',
  label: 'Page content',
  widget: 'richtext',
  modes: ['rich_text'],
  buttons: [
    'bold',
    'italic',
    'link',
    'heading-two',
    'heading-three',
    'bulleted-list',
    'numbered-list',
    'quote',
  ],
  editor_components: [],
};
const page = (name, label, extra = []) => ({
  name,
  label,
  file: `src/pages/${name}.md`,
  fields: [
    hidden('layout', 'base.njk'),
    hidden('permalink', name === 'index' ? '/' : `/${name}/`),
    text('title', 'Page title'),
    ...extra,
    ...(name === 'index' ? [] : [body]),
  ],
});
export default {
  load_config_file: false,
  locale: 'en',
  // Online at /admin/, editors sign in with a fine-grained GitHub access token
  // (this repository only, Contents: read and write). Saving commits to main,
  // and .github/workflows/deploy.yml publishes the site. The local editor
  // hides the sign-in and works through "Work with Local Repository".
  backend: {
    name: 'github',
    repo: 'momentful-io/website',
    branch: 'main',
    auth_methods: ['token'],
  },
  media_folder: 'src/assets/uploads',
  public_folder: '/assets/uploads',
  publish: false,
  collections: [
    {
      name: 'pages',
      label: 'Website pages',
      editor: { preview: false },
      files: [
        page('index', 'Homepage', [
          hidden('homepage', true),
          text('heading', 'Main heading'),
          { name: 'introduction', label: 'Introduction', widget: 'text' },
        ]),
        page('mission', 'Mission'),
        page('imprint', 'Imprint'),
        page('branding', 'Branding'),
      ],
    },
    {
      name: 'projects',
      label: 'Projects',
      label_singular: 'Project',
      folder: 'src/projects',
      create: true,
      delete: true,
      extension: 'md',
      format: 'yaml-frontmatter',
      identifier_field: 'slug',
      slug: '{{slug}}',
      summary: '{{name}}',
      sortable_fields: ['order', 'name'],
      editor: { preview: false },
      fields: [
        text('name', 'Project name'),
        // Keep the reserved names in sync with src/projects/projects.11tydata.js.
        text('slug', 'URL slug', {
          pattern: [
            '^(?!(?:mission|imprint|branding|assets|admin|editor|start|help)$)[a-z0-9]+(?:-[a-z0-9]+)*$',
            'Use lowercase letters, numbers and single hyphens; no reserved page names.',
          ],
          hint: 'The public URL is /slug/. Keep existing slugs unchanged to preserve links.',
        }),
        text('title', 'Page title'),
        text('subtitle', 'Subtitle', { required: false }),
        { name: 'summary', label: 'Summary', widget: 'text' },
        {
          name: 'order',
          label: 'Display order',
          widget: 'number',
          value_type: 'int',
          min: 0,
          default: 100,
        },
        {
          name: 'logo',
          label: 'Logo',
          widget: 'select',
          required: false,
          options: ['calendify', 'skedz'],
          hint: 'Optional. Without a logo the project card uses the standard project icon.',
        },
        body,
      ],
    },
    {
      name: 'data',
      label: 'Site information',
      editor: { preview: false },
      files: [
        {
          name: 'site',
          label: 'Website description',
          file: 'src/_data/site.json',
          fields: [
            hidden('name', 'Momentful I/O'),
            hidden('url', 'https://momentful.io'),
            hidden('language', 'en'),
            {
              name: 'description',
              label: 'Default search description',
              widget: 'text',
            },
          ],
        },
      ],
    },
  ],
};
