import {
	defineConfig,
	type TestProjectConfiguration,
	type ViteUserConfig,
} from 'vitest/config'

const testProjects: TestProjectConfiguration[] = [
	{
		extends: true,
		test: {
			include: ['packages/*/tests/**/*.test.ts'],
			name: 'unit',
		},
	},
	{
		extends: true,
		test: {
			include: ['tests/e2e/**/*.e2e.test.ts'],
			name: 'e2e',
		},
	},
	{
		extends: true,
		test: {
			include: [],
			name: 'types',
			typecheck: {
				enabled: true,
				include: ['packages/*/tests/**/*.test-d.ts'],
				only: true,
				tsconfig: './tooling/tsconfig/test.json',
			},
		},
	},
]

const config: ViteUserConfig = defineConfig({
	test: {
		coverage: {
			exclude: ['**/dist/**', '**/*.d.ts', '**/*.generated.ts'],
			include: ['packages/*/src/**/*.ts'],
			provider: 'v8',
			reporter: ['text', 'json', 'html'],
		},
		fileParallelism: true,
		pool: 'forks',
		// Root projects separate package ownership from cross-package behavior.
		projects: testProjects,
	},
})

export default config
