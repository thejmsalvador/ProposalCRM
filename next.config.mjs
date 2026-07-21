/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    '@dnd-kit/core',
    '@dnd-kit/sortable',
    '@dnd-kit/utilities',
  ],
  experimental: {
    serverComponentsExternalPackages: [
      'puppeteer',
      'puppeteer-core',
      '@sparticuz/chromium-min',
      // Keep Prisma's runtime out of the bundle so it loads as CJS from
      // node_modules (where __dirname natively exists). The generated client
      // shims __dirname for ESM, but ESM import hoisting evaluates the runtime
      // before the shim runs, crashing the serverless function on every route.
      '@prisma/client',
      '@prisma/adapter-pg',
      'pg',
      // Keep jsdom (pulled in by isomorphic-dompurify for server-side HTML
      // sanitization) out of the bundle. jsdom's transitive dep chain reaches
      // html-encoding-sniffer → @exodus/bytes, which is ESM-only. Next's
      // bundled server loader can't require() an ESM module and 500s every
      // route that renders sanitized rich text (e.g. /proposals/[id]).
      // Externalizing loads it from node_modules via native Node require,
      // which supports require(ESM) on the deployment's Node 24 runtime.
      'isomorphic-dompurify',
      'jsdom',
    ],
  },
};

export default nextConfig;
