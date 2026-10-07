import { defineConfig } from 'tsdown'

// The CLI needs two entries; keep the repository's ESM archive checks for both.
export default defineConfig({
	attw: { level: 'error', profile: 'esm-only' },
	clean: true,
	copy: [{ from: '../../LICENSE' }],
	dts: { generator: 'oxc' },
	entry: ['src/index.ts', 'src/cli.ts'],
	failOnWarn: true,
	fixedExtension: false,
	format: 'esm',
	platform: 'node',
	publint: true,
	sourcemap: true,
	target: 'node24',
	deps: { neverBundle: true },
})
