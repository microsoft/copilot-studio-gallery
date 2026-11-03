// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import { unified } from '@astrojs/markdown-remark';
import tailwindcss from '@tailwindcss/vite';
import rehypeSanitize from 'rehype-sanitize';
import { SITE_ORIGIN, SITE_BASE } from './src/lib/site.ts';

export default defineConfig({
  site: SITE_ORIGIN,
  base: SITE_BASE,
  trailingSlash: 'ignore',
  integrations: [react()],
  markdown: {
    processor: unified({ rehypePlugins: [rehypeSanitize] }),
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
