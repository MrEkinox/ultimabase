import { existsSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { ultimabaseTesting } from './vitest.js'

describe('ultimabaseTesting()', () => {
	it('points Vitest at the setup modules beside it', () => {
		const { globalSetup, setupFiles } = ultimabaseTesting()
		// Run from source here, so the `.ts` modules; `.js` once built.
		expect(globalSetup).toStrictEqual([
			path.join(import.meta.dirname, 'vitest-global-setup.ts'),
		])
		expect(setupFiles).toStrictEqual([
			path.join(import.meta.dirname, 'vitest-setup-file.ts'),
		])
		for (const file of [...globalSetup, ...setupFiles]) {
			expect(existsSync(file), file).toBe(true)
		}
	})

	it('gives servers a free port, one module realm and time to start', () => {
		const config = ultimabaseTesting()
		expect(config.env).toStrictEqual({ PORT: '0' })
		expect(config.execArgv).toStrictEqual(['--no-experimental-require-module'])
		expect(config.testTimeout).toBe(30_000)
		expect(config.hookTimeout).toBe(30_000)
	})

	it('returns a fresh configuration the caller can extend', () => {
		const first = ultimabaseTesting()
		first.setupFiles.push('./own-setup.ts')
		first.env.DEBUG = '1'
		expect(ultimabaseTesting().setupFiles).toHaveLength(1)
		expect(ultimabaseTesting().env).toStrictEqual({ PORT: '0' })
	})
})
