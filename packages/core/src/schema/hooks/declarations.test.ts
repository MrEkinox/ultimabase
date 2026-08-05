import { describe, expect, it } from 'vitest'

import { Schema, compileValidationPlans, stringField } from '../index.js'
import {
	getSchemaHookDeclarations,
	schemaHookPhases,
	type SchemaHookDeclarations,
} from './declarations.js'
import { getHookHandlerEntries } from './normalization.js'

const createSchema = (hooks?: object) =>
	Schema.define({
		className: 'HookedArticle',
		fields: {
			title: stringField({ validation: { required: true } }),
		},
		// Tests deliberately cross the untrusted JavaScript declaration boundary.
		...(hooks === undefined ? {} : { hooks }),
	})

describe('schema hook declarations', () => {
	it('copies and freezes handlers without exposing them as schema metadata', () => {
		const beforeCreate = () => undefined
		const source = { beforeCreate }
		const schema = createSchema(source)
		const declarations = getSchemaHookDeclarations(schema)

		source.beforeCreate = () => undefined

		expect(
			getHookHandlerEntries(declarations, 'beforeCreate')[0]?.handler,
		).toBe(beforeCreate)
		expect(Object.isFrozen(declarations)).toBe(true)
		expect(Object.isFrozen(declarations?.beforeCreate)).toBe(true)
		expect(Object.isFrozen(declarations?.beforeCreate?.all)).toBe(true)
		expect(
			Reflect.set(declarations ?? {}, 'beforeCreate', () => undefined),
		).toBe(false)
		expect(Object.keys(schema)).toStrictEqual([
			'definition',
			'className',
			'fields',
			'indexes',
			'extensions',
		])
		expect(schema).not.toHaveProperty('hooks')
	})

	it('retains declarations by exact schema identity', () => {
		const firstHandler = () => undefined
		const secondHandler = () => undefined
		const first = createSchema({ beforeCreate: firstHandler })
		const second = createSchema({ beforeCreate: secondHandler })

		expect(
			getHookHandlerEntries(getSchemaHookDeclarations(first), 'beforeCreate')[0]
				?.handler,
		).toBe(firstHandler)
		expect(
			getHookHandlerEntries(
				getSchemaHookDeclarations(second),
				'beforeCreate',
			)[0]?.handler,
		).toBe(secondHandler)
	})

	it('retains asynchronous handler identity without invoking it', () => {
		let calls = 0
		const afterCommit = (): Promise<void> => {
			calls += 1

			return Promise.resolve()
		}
		const schema = createSchema({ afterCommit })

		expect(
			getHookHandlerEntries(getSchemaHookDeclarations(schema), 'afterCommit')[0]
				?.handler,
		).toBe(afterCommit)
		expect(calls).toBe(0)
	})

	it('accepts every declared phase without executing its handler', () => {
		let calls = 0
		const hooks = Object.fromEntries(
			schemaHookPhases.map((phase) => [
				phase,
				() => {
					calls += 1
				},
			]),
		)
		const declarations = getSchemaHookDeclarations(createSchema(hooks))

		expect(Object.keys(declarations ?? {})).toStrictEqual(schemaHookPhases)
		expect(calls).toBe(0)
	})

	it('precomposes the remaining broad schema family branches', () => {
		const broad = () => undefined
		const specific = () => undefined
		const declarations = getSchemaHookDeclarations(
			createSchema({
				resolveInput: { all: broad, update: specific },
			}),
		)

		expect(
			getHookHandlerEntries(declarations, 'resolveInput', 'update').map(
				({ handler }) => handler,
			),
		).toStrictEqual([broad, specific])
	})

	it('does not allocate neutral declarations for absent or empty hooks', () => {
		expect(getSchemaHookDeclarations(createSchema())).toBeUndefined()
		expect(getSchemaHookDeclarations(createSchema({}))).toBeUndefined()
	})

	it('keeps validation plans independent from business callbacks', () => {
		const plain = createSchema()
		const hooked = createSchema({ beforeCreate: () => undefined })

		// Physical schema consumers receive the same structural plan either way.
		expect(compileValidationPlans(hooked)).toStrictEqual(
			compileValidationPlans(plain),
		)
	})

	it('accepts plain records with a null prototype', () => {
		const beforeCreate = () => undefined
		const hooks: Record<string, unknown> = Object.assign(
			Object.create(null) as object,
			{ beforeCreate },
		)
		const declarations = getSchemaHookDeclarations(createSchema(hooks))

		expect(
			getHookHandlerEntries(declarations, 'beforeCreate')[0]?.handler,
		).toBe(beforeCreate)
	})

	it.each([
		{ hooks: null, message: 'hooks must be a plain object' },
		{ hooks: [], message: 'hooks must be a plain object' },
		{ hooks: new Map(), message: 'hooks must be a plain object' },
		{ hooks: 'beforeCreate', message: 'hooks must be a plain object' },
		{
			hooks: { beforeUnknown: () => undefined },
			message: 'Unknown schema hook: hooks.beforeUnknown',
		},
		{
			hooks: { beforeCreate: undefined },
			message:
				'hooks.beforeCreate must be a function or non-empty handler list',
		},
		{
			hooks: { beforeCreate: [] },
			message:
				'hooks.beforeCreate must be a function or non-empty handler list',
		},
		{
			hooks: { resolveInput: {} },
			message: 'hooks.resolveInput family map must not be empty',
		},
		{
			hooks: { beforeCreate: [() => undefined, false] },
			message: 'hooks.beforeCreate[1] must be a function',
		},
	] as const)('rejects malformed hook declarations', ({ hooks, message }) => {
		expect(() => createSchema(hooks as object)).toThrow(new TypeError(message))
	})

	it('rejects symbol phases instead of silently dropping them', () => {
		const hooks = { [Symbol('beforeCreate')]: () => undefined }

		expect(() => createSchema(hooks)).toThrow(
			new TypeError('hooks contains an unsupported symbol key'),
		)
	})

	it('exposes an immutable internal declaration type', () => {
		const beforeCreate = () => undefined
		const declarations: SchemaHookDeclarations = {
			beforeCreate: {
				all: [
					{
						declarationBranch: 'direct',
						handler: beforeCreate,
						handlerIndex: 0,
					},
				],
				variants: {},
			},
		}

		// The public Runtime reader receives readonly capabilities.
		expect(Object.keys(declarations)).toStrictEqual(['beforeCreate'])
	})
})
