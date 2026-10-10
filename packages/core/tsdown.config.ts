import { defineConfig } from 'tsdown'

// Core publishes its application entry and the plugin-author subpath
// (ADR-0311); keep the repository's ESM archive checks for both.
export default defineConfig({
	attw: { level: 'error', profile: 'esm-only' },
	clean: ['dist', 'tsconfig.tsbuildinfo'],
	copy: [{ from: '../../LICENSE' }],
	dts: { generator: 'oxc' },
	entry: ['src/index.ts', 'src/plugin.ts'],
	failOnWarn: true,
	fixedExtension: false,
	format: 'esm',
	platform: 'node',
	publint: true,
	sourcemap: true,
	target: 'node24',
	deps: { neverBundle: true },
})
