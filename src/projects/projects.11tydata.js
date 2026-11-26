export default {
  layout: 'base.njk',
  project: true,
  eleventyComputed: {
    permalink: (data) => {
      // Keep the reserved names in sync with the slug pattern in cms/config.mjs.
      if (
        !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(data.slug) ||
        [
          'mission',
          'imprint',
          'branding',
          'assets',
          'admin',
          'editor',
          'start',
          'help',
        ].includes(data.slug)
      ) {
        throw new Error(`Invalid or reserved project slug: ${data.slug}`);
      }
      return `/${data.slug}/`;
    },
  },
};
