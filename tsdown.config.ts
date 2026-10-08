import { defineConfig, type UserConfig } from 'tsdown'

// Apply the same build contract to every package in the workspace.
const config: UserConfig = defineConfig({
	attw: {
		// UltimaBase publishes ESM only, so validate NodeNext ESM and bundler consumers.
		level: 'error',
		profile: 'esm-only',
	},
	// tsc --build also emits into dist; its build info must go with the outputs it
	// describes, or the next incremental typecheck re-emits only part of them.
	clean: ['dist', 'tsconfig.tsbuildinfo'],
	copy: [
		{
			// Every published archive must carry the repository's Apache license.
			from: '../../LICENSE',
		},
	],
	dts: {
		// Oxc avoids reusing declarations emitted by a preceding composite typecheck.
		generator: 'oxc',
	},
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
