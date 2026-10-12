/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Next.js 16 no longer runs ESLint as part of `next build`, and it rejects the
  // old `eslint` key in this file. Linting lives in `npm run lint`
  // (eslint.config.mjs) so the build and the linter stay independent.
};
export default nextConfig;
