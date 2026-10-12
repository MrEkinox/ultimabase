import { defineConfig } from 'tsdown'

// Applications, plugin authors and the Vitest configuration each have an
// entry (ADR-0327); Vitest loads the two setup modules by path.
export default defineConfig({
	attw: { level: 'error', profile: 'esm-only' },
	clean: ['dist', 'tsconfig.tsbuildinfo'],
	copy: [{ from: '../../LICENSE' }],
	dts: { generator: 'oxc' },
	entry: [
		'src/index.ts',
		'src/plugins.ts',
		'src/vitest.ts',
		'src/vitest-global-setup.ts',
		'src/vitest-setup-file.ts',
	],
	failOnWarn: true,
	fixedExtension: false,
	format: 'esm',
	platform: 'node',
	publint: true,
	sourcemap: true,
	target: 'node24',
	deps: { neverBundle: true },
})
