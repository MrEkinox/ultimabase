import { describe, expect, it } from 'vitest'

import {
	getHookHandlerEntries,
	normalizeHookDeclarations,
	type HookPhaseDescriptor,
	type NormalizedHookHandler,
	normalizeGlobalHookDeclarations,
	normalizeSchemaHookDeclarations,
} from './declarations.js'

const phases = ['beforeSave', 'afterSave', 'beforeCreate'] as const
type Phase = (typeof phases)[number]

const descriptors = {
	beforeSave: {
		order: 'broad-first',
		variants: ['create', 'update', 'upsert'],
	},
	afterSave: {
		order: 'specific-first',
		variants: ['create', 'update', 'upsert'],
	},
} as const satisfies Readonly<Partial<Record<Phase, HookPhaseDescriptor>>>

const normalize = (hooks: unknown) =>
	normalizeHookDeclarations({
		descriptors,
		hooks,
		phases,
		scope: 'fixture',
	})

/** Keeps behavior assertions focused on callback order rather than slot metadata. */
const readHandlers = (
	entries: readonly NormalizedHookHandler[],
): readonly NormalizedHookHandler['handler'][] =>
	entries.map(({ handler }) => handler)

describe('hook declaration normalization', () => {
	it('normalizes a direct handler into one immutable sequence', () => {
		const handler = () => undefined
		const declarations = normalize({ beforeCreate: handler })
		const phase = declarations?.beforeCreate

		expect(phase).toStrictEqual({
			all: [
				{
					declarationBranch: 'direct',
					handler,
					handlerIndex: 0,
				},
			],
			variants: {},
		})
		expect(Object.isFrozen(declarations)).toBe(true)
		expect(Object.isFrozen(phase)).toBe(true)
		expect(Object.isFrozen(phase?.all)).toBe(true)
		expect(Object.isFrozen(phase?.variants)).toBe(true)
		expect(
			readHandlers(getHookHandlerEntries(declarations, 'beforeCreate')),
		).toStrictEqual([handler])
		expect(Object.isFrozen(phase?.all[0])).toBe(true)
	})

	it('copies ordered lists without deduplicating callback identity', () => {
		const first = () => undefined
		const second = () => undefined
		const source = [first, second, first]
		const declarations = normalize({ beforeCreate: source })

		source.splice(0, source.length, second)

		expect(
			readHandlers(getHookHandlerEntries(declarations, 'beforeCreate')),
		).toStrictEqual([first, second, first])
		expect(Object.isFrozen(declarations?.beforeCreate?.all)).toBe(true)
	})

	it('precomposes broad-first and specific-first family branches', () => {
		const broad = () => undefined
		const shared = () => undefined
		const specific = () => undefined
		const declarations = normalize({
			beforeSave: { all: [broad, shared], create: specific },
			afterSave: { all: [broad, shared], create: specific },
		})

		expect(
			readHandlers(getHookHandlerEntries(declarations, 'beforeSave', 'create')),
		).toStrictEqual([broad, shared, specific])
		expect(
			readHandlers(getHookHandlerEntries(declarations, 'afterSave', 'create')),
		).toStrictEqual([specific, broad, shared])
		expect(
			readHandlers(getHookHandlerEntries(declarations, 'beforeSave', 'update')),
		).toStrictEqual([broad, shared])
		expect(
			getHookHandlerEntries(declarations, 'beforeSave', 'create').map(
				({ declarationBranch, handlerIndex }) => ({
					declarationBranch,
					handlerIndex,
				}),
			),
		).toStrictEqual([
			{ declarationBranch: 'all', handlerIndex: 0 },
			{ declarationBranch: 'all', handlerIndex: 1 },
			{ declarationBranch: 'create', handlerIndex: 0 },
		])
		expect(Object.isFrozen(declarations?.beforeSave?.variants.create)).toBe(
			true,
		)
	})

	it('supports a family-specific declaration without a broad handler', () => {
		const specific = () => undefined
		const declarations = normalize({ beforeSave: { update: specific } })

		expect(
			getHookHandlerEntries(declarations, 'beforeSave', 'create'),
		).toStrictEqual([])
		expect(
			readHandlers(getHookHandlerEntries(declarations, 'beforeSave', 'update')),
		).toStrictEqual([specific])
	})

	it('reuses one frozen empty sequence for absent phases', () => {
		const first = getHookHandlerEntries(normalize({}), 'beforeCreate')
		const second = getHookHandlerEntries(undefined, 'afterSave', 'create')

		expect(first).toBe(second)
		expect(Object.isFrozen(first)).toBe(true)
	})

	it.each([
		{
			hooks: { beforeCreate: [] },
			message:
				'hooks.beforeCreate must be a function or non-empty handler list',
		},
		{
			hooks: { beforeCreate: [() => undefined, false] },
			message: 'hooks.beforeCreate[1] must be a function',
		},
		{
			hooks: { beforeCreate: {} },
			message:
				'hooks.beforeCreate must be a function or non-empty handler list',
		},
		{
			hooks: { beforeSave: {} },
			message: 'hooks.beforeSave family map must not be empty',
		},
		{
			hooks: { beforeSave: { create: [] } },
			message:
				'hooks.beforeSave.create must be a function or non-empty handler list',
		},
		{
			hooks: { beforeSave: { remove: () => undefined } },
			message: 'Unknown hook family branch: hooks.beforeSave.remove',
		},
	] as const)(
		'reports malformed nested declarations by path',
		({ hooks, message }) => {
			expect(() => normalize(hooks)).toThrow(new TypeError(message))
		},
	)

	it('rejects symbol family branches', () => {
		const family = { [Symbol('create')]: () => undefined }

		expect(() => normalize({ beforeSave: family })).toThrow(
			new TypeError('hooks.beforeSave contains an unsupported symbol key'),
		)
	})
})

// ADR-0347: Hooks take `all` and operations; there are no read hooks.
describe('schema and global hook keys', () => {
	it.each([
		{ scope: 'schema', group: 'beforeOperation', key: 'read' },
		{ scope: 'schema', group: 'afterCommit', key: 'write' },
		{ scope: 'global', group: 'afterOperation', key: 'read' },
		{ scope: 'global', group: 'beforeOperation', key: 'write' },
	] as const)(
		'rejects the $key group in a $scope hook',
		({ scope, group, key }) => {
			const normalize =
				scope === 'schema'
					? normalizeSchemaHookDeclarations
					: normalizeGlobalHookDeclarations
			expect(() => normalize({ [group]: { [key]: () => undefined } })).toThrow(
				new TypeError(
					`hooks.${group}.${key} is not a Hook key: Hooks take all, create, update, upsert, delete or a plugin operation, and ${key} is an operation group`,
				),
			)
		},
	)
})
