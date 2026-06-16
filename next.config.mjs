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
    ],
  },
};

export default nextConfig;
