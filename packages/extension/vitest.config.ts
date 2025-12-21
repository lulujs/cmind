/*
 * For a detailed explanation regarding each configuration property and type check, visit:
 * https://vitest.dev/config/
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        deps: {
            interopDefault: true
        },
        include: ['**/*.test.ts'],
        environment: 'node',
        alias: {
            vscode: new URL('./test/mocks/vscode.ts', import.meta.url).pathname
        }
    }
});