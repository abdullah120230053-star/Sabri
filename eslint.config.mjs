import js from '@eslint/js';
import ts from 'typescript-eslint';
export default ts.config(
  { ignores: ['out/**', 'release/**', 'node_modules/**'] },
  { files: ['**/*.{ts,tsx}'], extends: [js.configs.recommended, ts.configs.recommended] },
);
