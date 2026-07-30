import { defineConfig, type UserConfig } from 'tsdown'

// Apply the same build contract to every package in the workspace.
const config: UserConfig = defineConfig({
	attw: {
		// UltimaBase publishes ESM only, so validate NodeNext ESM and bundler consumers.
		level: 'error',
		profile: 'esm-only',
	},
	clean: true,
	copy: [
		{
			// Every published archive must carry the repository's Apache license.
			from: '../../LICENSE',
		},
	],
	dts: true,
	entry: ['src/index.ts'],
	// Package metadata warnings are release blockers rather than advisory output.
	failOnWarn: true,
	// Package type controls the ESM extension and keeps exports on standard .js files.
	fixedExtension: false,
	format: 'esm',
	platform: 'node',
	// Validate the exact archive produced by the detected package manager.
	publint: true,
	sourcemap: true,
	target: 'node24',
	deps: {
		// Consumers resolve their own workspace and third-party dependencies.
		neverBundle: true,
	},
})

export default config
