import { defineConfig, type UserConfig } from 'tsdown'

// Apply the same build contract to every package in the workspace.
const config: UserConfig = defineConfig({
	clean: true,
	dts: true,
	entry: ['src/index.ts'],
	// Package type controls the ESM extension and keeps exports on standard .js files.
	fixedExtension: false,
	format: 'esm',
	platform: 'node',
	sourcemap: true,
	target: 'node24',
	deps: {
		// Consumers resolve their own workspace and third-party dependencies.
		neverBundle: true,
	},
})

export default config
