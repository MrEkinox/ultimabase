import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { FrameworkError } from '../errors/framework-error.js'
import { assertCoreRangeSatisfied, coreVersion } from './core-version.js'
import { PluginGraph } from './graph.js'
import { normalizePlugins } from './normalization.js'
import { plugin as createPlugin } from './plugin.js'

const readPackageVersion = (): unknown => {
	const manifest: unknown = JSON.parse(
		readFileSync(path.join(import.meta.dirname, '../../package.json'), 'utf8'),
	)
	return typeof manifest === 'object' && manifest !== null
		? Reflect.get(manifest, 'version')
		: undefined
}

const pluginWithCore = (core: string) =>
	createPlugin({
		id: 'fixture.core-range',
		version: '1.0.0',
		core,
		contributions: [],
	})

const graphOf = (core: string): PluginGraph =>
	new PluginGraph(normalizePlugins([pluginWithCore(core)]))

const captureError = (operation: () => unknown): unknown => {
	try {
		operation()
	} catch (error: unknown) {
		return error
	}
	throw new Error('Expected the operation to throw')
}

describe('Core range (ADR-0338)', () => {
	it('knows the version of the installed Core package', () => {
		expect(coreVersion).toBe(readPackageVersion())
	})

	it.each(['^0.0.0', '0.0.0', '>=0.0.0', '0.x', '*', '^0.0.0-next.0'])(
		'accepts a plugin whose range %s the installed Core satisfies',
		(core) => {
			expect(graphOf(core).has('fixture.core-range')).toBe(true)
		},
	)

	it('rejects a plugin whose range the installed Core does not satisfy', () => {
		const error = captureError(() => graphOf('^1.0.0'))

		expect(error).toBeInstanceOf(FrameworkError)
		expect(error).toMatchObject({
			code: 'PLUGIN_PROTOCOL_INCOMPATIBLE',
			message: `Plugin "fixture.core-range" requires @ultimabase/core version "^1.0.0", but version "${coreVersion}" is installed.`,
			internalDetails: {
				kind: 'core-version',
				pluginId: 'fixture.core-range',
				requiredVersion: '^1.0.0',
				installedVersion: coreVersion,
			},
		})
	})

	it('names the exact instance of a repeated plugin', () => {
		const instance = createPlugin({
			id: 'fixture.core-range',
			instanceId: 'secondary',
			version: '1.0.0',
			core: '^1.0.0',
			contributions: [],
		})

		expect(() => new PluginGraph(normalizePlugins([instance]))).toThrow(
			`Plugin "fixture.core-range (instance secondary)" requires @ultimabase/core version "^1.0.0", but version "${coreVersion}" is installed.`,
		)
	})

	it('follows the peer prerelease rule for a prerelease Core', () => {
		const { manifest } = pluginWithCore('^1.0.0')
		const prerelease = pluginWithCore('^1.0.0-next.0').manifest

		// A prerelease satisfies only a range naming the same version tuple.
		expect(() => {
			assertCoreRangeSatisfied(manifest, '1.0.0-next.1')
		}).toThrow(
			'Plugin "fixture.core-range" requires @ultimabase/core version "^1.0.0", but version "1.0.0-next.1" is installed.',
		)
		expect(() => {
			assertCoreRangeSatisfied(prerelease, '1.0.0-next.1')
		}).not.toThrow()
		expect(() => {
			assertCoreRangeSatisfied(prerelease, '1.2.0')
		}).not.toThrow()
		expect(() => {
			assertCoreRangeSatisfied(prerelease, '1.2.0-next.0')
		}).toThrow(FrameworkError)
	})

	it('still reports a malformed range when the plugin is declared', () => {
		expect(() => pluginWithCore('later')).toThrow(
			new TypeError('core must be a valid semantic version range'),
		)
	})
})
