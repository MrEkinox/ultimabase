import { describe, expect, it } from 'vitest'

import { FrameworkError } from '../errors/framework-error.js'
import { plugin as createPlugin } from './plugin.js'
import { contributeApplication } from './plugin-contributions.js'

import { normalizePlugins } from './normalization.js'

const captureFrameworkError = (operation: () => unknown): unknown => {
	try {
		operation()
	} catch (error: unknown) {
		return error
	}

	throw new Error('Expected the operation to throw a FrameworkError')
}

const expectFrameworkError = (
	error: unknown,
): { readonly code: unknown; readonly internalDetails: unknown } => {
	expect(error).toBeInstanceOf(FrameworkError)

	if (
		typeof error !== 'object' ||
		error === null ||
		!('code' in error) ||
		!('internalDetails' in error)
	) {
		throw new TypeError('Expected framework error diagnostics')
	}

	return error
}

describe('normalizePlugins', () => {
	it('snapshots a flat list while preserving source order and dependencies', () => {
		let setupCalls = 0
		const leaf = createPlugin({
			version: '0.0.0',
			core: '^0.0.0',
			id: 'fixture.leaf',
			dependencies: [{ pluginId: 'fixture.child', version: '^0.0.0' }],
			contributions: [
				contributeApplication((context) => {
					setupCalls += 1
					const exports = undefined
					const lifecycleContext = { ...context, pluginExports: exports }
					void lifecycleContext
					return { exports }
				}),
			],
		})
		const child = createPlugin({
			version: '0.0.0',
			core: '^0.0.0',
			id: 'fixture.child',
			contributions: [],
		})
		const root = createPlugin({
			version: '0.0.0',
			core: '^0.0.0',
			id: 'fixture.root',
			contributions: [],
		})

		const normalized = normalizePlugins([root, child, leaf])

		expect(normalized).toHaveLength(3)
		expect(
			normalized.map(({ definition }) => definition.manifest.identity.pluginId),
		).toStrictEqual(['fixture.root', 'fixture.child', 'fixture.leaf'])
		expect(
			normalized.map(({ configurationIndex }) => configurationIndex),
		).toStrictEqual([0, 1, 2])
		expect(normalized[1]?.dependencies).toStrictEqual([])
		expect(normalized[2]?.dependencies).toStrictEqual([
			{ pluginId: 'fixture.child', version: '^0.0.0' },
		])
		expect(setupCalls).toBe(0)
		expect(Object.isFrozen(normalized)).toBe(true)
		expect(Object.isFrozen(normalized[1])).toBe(true)
		expect(Object.isFrozen(normalized[1]?.dependencies)).toBe(true)
	})

	it('deduplicates a repeated exact definition from the flat list', () => {
		const shared = createPlugin({
			version: '0.0.0',
			core: '^0.0.0',
			id: 'fixture.shared',
			contributions: [],
		})
		const normalized = normalizePlugins([shared, shared])
		const sharedPlugin = normalized.find(
			({ definition }) => definition === shared,
		)

		expect(normalized).toHaveLength(1)
		expect(sharedPlugin).toMatchObject({
			configurationIndex: 0,
			dependencies: [],
		})
	})

	it('rejects separate definitions sharing one structured identity', () => {
		const first = createPlugin({
			version: '0.0.0',
			core: '^0.0.0',
			id: 'fixture.database',
			contributions: [],
		})
		const second = createPlugin({
			version: '0.0.0',
			core: '^0.0.0',
			id: 'fixture.database',
			contributions: [
				contributeApplication((context) => {
					const exports = { dialect: 'other' }
					const lifecycleContext = { ...context, pluginExports: exports }
					void lifecycleContext
					return { exports }
				}),
			],
		})

		const error = expectFrameworkError(
			captureFrameworkError(() => normalizePlugins([first, second])),
		)

		expect(error.code).toBe('PLUGIN_DUPLICATE')
		expect(error.internalDetails).toStrictEqual({
			pluginId: 'fixture.database',
			source: 'definition',
		})
	})

	it('accepts repeated plugins only through distinct explicit instance IDs', () => {
		const first = createPlugin({
			version: '0.0.0',
			core: '^0.0.0',
			id: 'fixture.database',
			instanceId: 'primary',
			contributions: [],
		})
		const second = createPlugin({
			version: '0.0.0',
			core: '^0.0.0',
			id: 'fixture.database',
			instanceId: 'analytics',
			contributions: [],
		})

		expect(normalizePlugins([first, second])).toHaveLength(2)
		expect(() =>
			normalizePlugins([
				createPlugin({
					version: '0.0.0',
					core: '^0.0.0',
					id: 'fixture.cache',
					contributions: [],
				}),
				createPlugin({
					version: '0.0.0',
					core: '^0.0.0',
					id: 'fixture.cache',
					instanceId: 'secondary',
					contributions: [],
				}),
			]),
		).toThrow(FrameworkError)
	})

	it('does not infer exclusivity from unrelated plugin identities', () => {
		const postgres = createPlugin({
			version: '0.0.0',
			core: '^0.0.0',
			id: 'fixture.postgres',
			contributions: [],
		})
		const sql = createPlugin({
			version: '0.0.0',
			core: '^0.0.0',
			id: 'fixture.sql',
			contributions: [],
		})

		expect(normalizePlugins([postgres, sql])).toHaveLength(2)
	})

	it('accepts independent plugin identities', () => {
		const database = createPlugin({
			version: '0.0.0',
			core: '^0.0.0',
			id: 'fixture.database',
			contributions: [],
		})
		const transport = createPlugin({
			version: '0.0.0',
			core: '^0.0.0',
			id: 'fixture.transport',
			contributions: [],
		})

		expect(normalizePlugins([database, transport])).toHaveLength(2)
	})

	it('guards JavaScript callers from malformed root definitions', () => {
		expect(() => {
			// @ts-expect-error -- Runtime validation protects non-TypeScript callers.
			normalizePlugins('fixture')
		}).toThrow(new TypeError('plugins must be an array'))
		expect(() => {
			// @ts-expect-error -- Only definitions created by Core have valid provenance.
			normalizePlugins([{ name: 'fixture.forged' }])
		}).toThrow(new TypeError('plugins[0] must be created by plugin()'))
	})
})
