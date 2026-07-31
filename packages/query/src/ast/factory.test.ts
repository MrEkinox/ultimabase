import { booleanField, defineSchema, stringField } from '@ultimabase/schema'
import { describe, expect, it } from 'vitest'

import { createQueryAst } from './factory.js'

const postSchema = defineSchema({
	className: 'Post',
	fields: {
		title: stringField(),
		published: booleanField({ default: false }),
	},
})

describe('createQueryAst', () => {
	it('creates one immutable transport-neutral initial query', () => {
		const ast = createQueryAst(postSchema)

		expect(ast).toStrictEqual({
			kind: 'query',
			schema: { kind: 'schema', definition: postSchema },
			selection: { kind: 'selection', fields: [] },
			where: undefined,
			ordering: { kind: 'ordering', orders: [] },
			pagination: undefined,
		})
		expect(ast.schema.definition).toBe(postSchema)
		expect(Object.isFrozen(ast)).toBe(true)
		expect(Object.isFrozen(ast.schema)).toBe(true)
		expect(Object.isFrozen(ast.selection)).toBe(true)
		expect(Object.isFrozen(ast.selection.fields)).toBe(true)
		expect(Object.isFrozen(ast.ordering)).toBe(true)
		expect(Object.isFrozen(ast.ordering.orders)).toBe(true)
		expect(Reflect.set(ast, 'where', { kind: 'transport-filter' })).toBe(false)
		expect(ast).not.toHaveProperty('sql')
		expect(ast).not.toHaveProperty('transport')
	})

	it('reuses only immutable empty clause nodes across initial queries', () => {
		const first = createQueryAst(postSchema)
		const second = createQueryAst(postSchema)

		expect(first).not.toBe(second)
		expect(first.schema).not.toBe(second.schema)
		expect(first.selection).toBe(second.selection)
		expect(first.ordering).toBe(second.ordering)
	})

	it('protects JavaScript callers from invalid schema references', () => {
		expect(() => {
			// @ts-expect-error -- Runtime validation protects non-object callers.
			createQueryAst(null)
		}).toThrow(new TypeError('query schema must be a schema definition'))
		expect(() => {
			// @ts-expect-error -- Runtime validation protects incomplete definitions.
			createQueryAst({
				className: '',
			})
		}).toThrow(
			new TypeError('query schema className must be a non-empty string'),
		)
	})
})
