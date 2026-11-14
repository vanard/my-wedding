import { defineConfig } from 'astro/config';

// Absolute site URL, used for the link-preview image (WhatsApp/Instagram need absolute URLs).
// On Vercel this comes from the system variable VERCEL_PROJECT_PRODUCTION_URL (for example
// my-wedding.vercel.app); SITE_URL overrides it, e.g. after adding a custom domain.
const host = process.env.SITE_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`);

export default defineConfig({
  output: 'static',
  site: host || undefined,
  vite: { build: { target: ['safari14'] } },
});
