import { describe, expect, it } from 'vitest'

import { Schema, compileValidationPlans, stringField } from '../index.js'
import {
	getSchemaHookDeclarations,
	schemaHookPhases,
	type SchemaHookDeclarations,
} from './declarations.js'
import { getHookHandlers } from './normalization.js'

const createSchema = (hooks?: object) =>
	new Schema({
		className: 'HookedArticle',
		fields: {
			title: stringField({ validation: { required: true } }),
		},
		// Tests deliberately cross the untrusted JavaScript declaration boundary.
		...(hooks === undefined ? {} : { hooks }),
	})

describe('schema hook declarations', () => {
	it('copies and freezes handlers without exposing them as schema metadata', () => {
		const beforeSave = () => undefined
		const source = { beforeSave }
		const schema = createSchema(source)
		const declarations = getSchemaHookDeclarations(schema)

		source.beforeSave = () => undefined

		expect(declarations).toStrictEqual({
			beforeSave: { all: [beforeSave], variants: {} },
		})
		expect(getHookHandlers(declarations, 'beforeSave')[0]).toBe(beforeSave)
		expect(Object.isFrozen(declarations)).toBe(true)
		expect(Object.isFrozen(declarations?.beforeSave)).toBe(true)
		expect(Object.isFrozen(declarations?.beforeSave?.all)).toBe(true)
		expect(Reflect.set(declarations ?? {}, 'beforeSave', () => undefined)).toBe(
			false,
		)
		expect(Object.keys(schema)).toStrictEqual([
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
		const first = createSchema({ beforeSave: firstHandler })
		const second = createSchema({ beforeSave: secondHandler })

		expect(
			getHookHandlers(getSchemaHookDeclarations(first), 'beforeSave')[0],
		).toBe(firstHandler)
		expect(
			getHookHandlers(getSchemaHookDeclarations(second), 'beforeSave')[0],
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
			getHookHandlers(getSchemaHookDeclarations(schema), 'afterCommit')[0],
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

	it('precomposes broad schema family branches in lifecycle order', () => {
		const broad = () => undefined
		const specific = () => undefined
		const declarations = getSchemaHookDeclarations(
			createSchema({
				beforeOperation: { all: broad, delete: specific },
				afterOperation: { all: broad, delete: specific },
			}),
		)

		expect(
			getHookHandlers(declarations, 'beforeOperation', 'delete'),
		).toStrictEqual([broad, specific])
		expect(
			getHookHandlers(declarations, 'afterOperation', 'delete'),
		).toStrictEqual([specific, broad])
	})

	it('does not allocate neutral declarations for absent or empty hooks', () => {
		expect(getSchemaHookDeclarations(createSchema())).toBeUndefined()
		expect(getSchemaHookDeclarations(createSchema({}))).toBeUndefined()
	})

	it('keeps validation plans independent from business callbacks', () => {
		const plain = createSchema()
		const hooked = createSchema({ beforeSave: () => undefined })

		// Physical schema consumers receive the same structural plan either way.
		expect(compileValidationPlans(hooked)).toStrictEqual(
			compileValidationPlans(plain),
		)
	})

	it('accepts plain records with a null prototype', () => {
		const beforeSave = () => undefined
		const hooks: Record<string, unknown> = Object.assign(
			Object.create(null) as object,
			{ beforeSave },
		)
		const declarations = getSchemaHookDeclarations(createSchema(hooks))

		expect(getHookHandlers(declarations, 'beforeSave')[0]).toBe(beforeSave)
	})

	it.each([
		{ hooks: null, message: 'hooks must be a plain object' },
		{ hooks: [], message: 'hooks must be a plain object' },
		{ hooks: new Map(), message: 'hooks must be a plain object' },
		{ hooks: 'beforeSave', message: 'hooks must be a plain object' },
		{
			hooks: { beforeUnknown: () => undefined },
			message: 'Unknown schema hook: hooks.beforeUnknown',
		},
		{
			hooks: { beforeSave: undefined },
			message: 'hooks.beforeSave must be a function or non-empty handler list',
		},
		{
			hooks: { beforeSave: [] },
			message: 'hooks.beforeSave must be a function or non-empty handler list',
		},
		{
			hooks: { beforeSave: {} },
			message: 'hooks.beforeSave family map must not be empty',
		},
		{
			hooks: { beforeSave: [() => undefined, false] },
			message: 'hooks.beforeSave[1] must be a function',
		},
	] as const)('rejects malformed hook declarations', ({ hooks, message }) => {
		expect(() => createSchema(hooks as object)).toThrow(new TypeError(message))
	})

	it('rejects symbol phases instead of silently dropping them', () => {
		const hooks = { [Symbol('beforeSave')]: () => undefined }

		expect(() => createSchema(hooks)).toThrow(
			new TypeError('hooks contains an unsupported symbol key'),
		)
	})

	it('exposes an immutable internal declaration type', () => {
		const beforeSave = () => undefined
		const declarations: SchemaHookDeclarations = {
			beforeSave: { all: [beforeSave], variants: {} },
		}

		// The public Runtime reader receives readonly capabilities.
		expect(Object.keys(declarations)).toStrictEqual(['beforeSave'])
	})
})
