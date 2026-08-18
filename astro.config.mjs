// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import { unified } from '@astrojs/markdown-remark';
import tailwindcss from '@tailwindcss/vite';
import rehypeSanitize from 'rehype-sanitize';

export default defineConfig({
  site: 'https://microsoft.github.io',
  base: '/copilot-studio-gallery',
  trailingSlash: 'ignore',
  integrations: [react()],
  markdown: {
    processor: unified({ rehypePlugins: [rehypeSanitize] }),
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
