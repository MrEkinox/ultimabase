import { describe, expect, it } from 'vitest'

import { FrameworkError } from '../errors/framework-error.js'
import { definePlugin } from './definition.js'
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
	it('flattens deep composition while preserving source and parent metadata', () => {
		let setupCalls = 0
		const leaf = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.leaf',
			dependencies: [{ pluginId: 'fixture.child', version: '^0.0.0' }],
			setup: () => {
				setupCalls += 1
			},
		})
		const child = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.child',
			plugins: [leaf],
		})
		const root = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.root',
			plugins: [child],
		})

		const normalized = normalizePlugins([root])

		expect(normalized).toHaveLength(3)
		expect(
			normalized.map(({ definition }) => definition.manifest.identity.pluginId),
		).toStrictEqual(['fixture.root', 'fixture.child', 'fixture.leaf'])
		expect(
			normalized.map(({ configurationIndex }) => configurationIndex),
		).toStrictEqual([0, 1, 2])
		expect(normalized[0]?.parentIdentities).toStrictEqual([])
		expect(normalized[1]?.parentIdentities).toStrictEqual([
			{ pluginId: 'fixture.root' },
		])
		expect(normalized[1]?.dependencies).toStrictEqual([])
		expect(normalized[2]?.parentIdentities).toStrictEqual([
			{ pluginId: 'fixture.child' },
		])
		expect(normalized[2]?.dependencies).toStrictEqual([
			{ pluginId: 'fixture.child', version: '^0.0.0' },
		])
		expect(setupCalls).toBe(0)
		expect(Object.isFrozen(normalized)).toBe(true)
		expect(Object.isFrozen(normalized[1])).toBe(true)
		expect(Object.isFrozen(normalized[1]?.parentIdentities)).toBe(true)
		expect(Object.isFrozen(normalized[1]?.dependencies)).toBe(true)
	})

	it('deduplicates repeated definition identities and retains every parent', () => {
		const shared = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.shared',
		})
		const firstParent = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.first-parent',
			plugins: [shared, shared],
		})
		const secondParent = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.second-parent',
			plugins: [shared],
		})

		const normalized = normalizePlugins([
			shared,
			firstParent,
			secondParent,
			shared,
		])
		const sharedPlugin = normalized.find(
			({ definition }) => definition === shared,
		)

		expect(normalized).toHaveLength(3)
		expect(sharedPlugin).toMatchObject({
			configurationIndex: 0,
			parentIdentities: [
				{ pluginId: 'fixture.first-parent' },
				{ pluginId: 'fixture.second-parent' },
			],
			dependencies: [],
		})
	})

	it('rejects separate definitions sharing one structured identity', () => {
		const first = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.database',
		})
		const second = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.database',
			setup: () => ({ dialect: 'other' }),
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
		const first = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.database',
			instanceId: 'primary',
		})
		const second = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.database',
			instanceId: 'analytics',
		})

		expect(normalizePlugins([first, second])).toHaveLength(2)
		expect(() =>
			normalizePlugins([
				definePlugin({
					version: '0.0.0',
					core: '^0.0.0',
					pluginId: 'fixture.cache',
				}),
				definePlugin({
					version: '0.0.0',
					core: '^0.0.0',
					pluginId: 'fixture.cache',
					instanceId: 'secondary',
				}),
			]),
		).toThrow(FrameworkError)
	})

	it('does not infer exclusivity from unrelated plugin identities', () => {
		const postgres = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.postgres',
		})
		const sql = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.sql',
		})

		expect(normalizePlugins([postgres, sql])).toHaveLength(2)
	})

	it('accepts independent plugin identities', () => {
		const database = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.database',
		})
		const transport = definePlugin({
			version: '0.0.0',
			core: '^0.0.0',
			pluginId: 'fixture.transport',
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
		}).toThrow(new TypeError('plugins[0] must be created by definePlugin'))
	})
})
