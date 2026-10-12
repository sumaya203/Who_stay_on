import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import globals from 'globals';

/**
 * ESLint 9 flat config.
 *
 * `eslint-config-next` ships a flat preset already (Next.js 16), so it is spread
 * directly instead of being wrapped in a compatibility layer. The extra block
 * only declares the globals the app and the test suite actually use, and turns
 * unused bindings into warnings so `npm run lint` reports instead of failing on
 * intentional placeholders.
 */
const config = [
  {
    ignores: ['.next/**', 'node_modules/**', 'out/**', 'build/**', 'coverage/**'],
  },
  ...nextCoreWebVitals,
  {
    files: ['**/*.{js,jsx,mjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
];

export default config;
