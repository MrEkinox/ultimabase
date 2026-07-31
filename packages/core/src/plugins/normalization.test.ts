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
			name: 'fixture.leaf',
			dependencies: ['fixture.child'],
			setup: () => {
				setupCalls += 1
			},
		})
		const child = definePlugin({
			name: 'fixture.child',
			plugins: [leaf],
		})
		const root = definePlugin({
			name: 'fixture.root',
			plugins: [child],
		})

		const normalized = normalizePlugins([root])

		expect(normalized).toHaveLength(3)
		expect(normalized.map(({ definition }) => definition.name)).toStrictEqual([
			'fixture.root',
			'fixture.child',
			'fixture.leaf',
		])
		expect(
			normalized.map(({ configurationIndex }) => configurationIndex),
		).toStrictEqual([0, 1, 2])
		expect(normalized[0]?.parentNames).toStrictEqual([])
		expect(normalized[1]?.parentNames).toStrictEqual(['fixture.root'])
		expect(normalized[1]?.dependencies).toStrictEqual(['fixture.root'])
		expect(normalized[2]?.parentNames).toStrictEqual(['fixture.child'])
		expect(normalized[2]?.dependencies).toStrictEqual(['fixture.child'])
		expect(setupCalls).toBe(0)
		expect(Object.isFrozen(normalized)).toBe(true)
		expect(Object.isFrozen(normalized[1])).toBe(true)
		expect(Object.isFrozen(normalized[1]?.parentNames)).toBe(true)
		expect(Object.isFrozen(normalized[1]?.dependencies)).toBe(true)
	})

	it('deduplicates repeated definition identities and retains every parent', () => {
		const shared = definePlugin({ name: 'fixture.shared' })
		const firstParent = definePlugin({
			name: 'fixture.first-parent',
			plugins: [shared, shared],
		})
		const secondParent = definePlugin({
			name: 'fixture.second-parent',
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
			parentNames: ['fixture.first-parent', 'fixture.second-parent'],
			dependencies: ['fixture.first-parent', 'fixture.second-parent'],
		})
	})

	it('rejects separate definitions sharing one name', () => {
		const first = definePlugin({ name: 'fixture.database' })
		const second = definePlugin({
			name: 'fixture.database',
			setup: () => ({ dialect: 'other' }),
		})

		const error = expectFrameworkError(
			captureFrameworkError(() => normalizePlugins([first, second])),
		)

		expect(error.code).toBe('PLUGIN_DUPLICATE')
		expect(error.internalDetails).toStrictEqual({
			pluginName: 'fixture.database',
			source: 'definition',
		})
	})

	it('rejects distinct plugins occupying the same exclusive slot', () => {
		const postgres = definePlugin({
			name: 'fixture.postgres',
			slot: 'database-adapter',
		})
		const sql = definePlugin({
			name: 'fixture.sql',
			slot: 'database-adapter',
		})

		const error = expectFrameworkError(
			captureFrameworkError(() => normalizePlugins([postgres, sql])),
		)

		expect(error.code).toBe('PLUGIN_CONFLICT')
		expect(error.internalDetails).toStrictEqual({
			kind: 'exclusive-slot',
			slot: 'database-adapter',
			pluginNames: ['fixture.postgres', 'fixture.sql'],
		})
	})

	it('accepts distinct exclusive slots', () => {
		const database = definePlugin({
			name: 'fixture.database',
			slot: 'database-adapter',
		})
		const transport = definePlugin({
			name: 'fixture.transport',
			slot: 'http-server',
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
