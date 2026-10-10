import { describe, expect, it } from 'vitest'

import { QueryBuilder } from '../../query/query/query.js'
import { Schema } from './definition.js'
import {
	isSchemaResult,
	materializePreparedSchemaDraft,
	materializeSchemaModel,
} from './model-materialization.js'
import { UltimaBase } from '../../runtime/application/ultima-base.js'

/** Calls `new` on a value whose type has no construct signature (ADR-0310). */
const construct = (target: unknown, args: readonly unknown[]): unknown => {
	if (typeof target !== 'function') throw new TypeError('Expected a class')
	return Reflect.construct(target, args)
}

const Post = UltimaBase.Schema.define({
	className: 'Post',
	fields: (field) => ({
		title: field.string({ required: true }),
		summary: field.string(),
		profile: field.object({
			fields: (field) => ({
				displayName: field.string({ required: true }),
			}),
		}),
	}),
})

// ADR-0310: a schema has static commands only; results are frozen plain data.
describe('plain schema results', () => {
	it('refuses to construct a schema', () => {
		expect(() => construct(Post, [{ title: 'Draft' }])).toThrow(
			new TypeError(
				'Post is not constructible: create rows with Post.createOne({ data })',
			),
		)
		expect(typeof Post.createOne).toBe('function')
		expect(Schema.is(Post)).toBe(true)
	})

	it('materializes prepared drafts as frozen plain objects', () => {
		const prepared = materializePreparedSchemaDraft(Post, {
			createdAt: '2026-08-08T00:00:00.000Z',
			id: '0198f090-2a50-7000-8000-000000000031',
			profile: null,
			summary: null,
			title: 'Prepared',
			updatedAt: '2026-08-08T00:00:00.000Z',
		})

		expect(Reflect.getPrototypeOf(prepared)).toBe(Object.prototype)
		expect(prepared).toStrictEqual({
			createdAt: '2026-08-08T00:00:00.000Z',
			id: '0198f090-2a50-7000-8000-000000000031',
			profile: null,
			summary: null,
			title: 'Prepared',
			updatedAt: '2026-08-08T00:00:00.000Z',
		})
		expect(Object.isFrozen(prepared)).toBe(true)
		expect(isSchemaResult(prepared)).toBe(false)
		expect(() => materializePreparedSchemaDraft(Post, [])).toThrow(
			new TypeError('Prepared draft schema values must be a plain object'),
		)
	})

	it('materializes only visible Runtime values as method-free results', () => {
		const selected = materializeSchemaModel(Post, {
			id: '0198f090-2a50-7000-8000-000000000032',
			title: 'Selected',
		})

		expect(Reflect.getPrototypeOf(selected)).toBe(Object.prototype)
		expect(Object.isFrozen(selected)).toBe(true)
		expect(isSchemaResult(selected)).toBe(true)
		expect(selected).toStrictEqual({
			id: '0198f090-2a50-7000-8000-000000000032',
			title: 'Selected',
		})
		for (const method of [
			'get',
			'toJSON',
			'update',
			'delete',
			'fetch',
			'exists',
			'relation',
			'toPointer',
		]) {
			expect(method in selected).toBe(false)
		}
		expect(JSON.stringify(selected)).toBe(
			'{"id":"0198f090-2a50-7000-8000-000000000032","title":"Selected"}',
		)
		expect(() => materializeSchemaModel(Post, { unknown: true })).toThrow(
			new TypeError(
				'Persisted schema values contain an unknown field: unknown',
			),
		)
		expect(() => materializeSchemaModel(Post, [])).toThrow(
			new TypeError('Persisted schema values must be a plain object'),
		)
		expect(() =>
			materializeSchemaModel(Post, { [Symbol('unknown')]: true }),
		).toThrow(
			new TypeError(
				'Persisted schema values contain an unknown field: Symbol(unknown)',
			),
		)

		const foreignSchema = (() => undefined) as unknown as typeof Post

		expect(() => materializeSchemaModel(foreignSchema, {})).toThrow(
			new TypeError('Schema model class was not created by App.Schema.define'),
		)
	})

	it('creates independent QueryBuilder branches for reusable object inputs', () => {
		const first = new QueryBuilder(Post).select({ id: true, title: true })
		const second = new QueryBuilder(Post).where((where) =>
			where.eq('title', 'Second'),
		)

		expect(first).toBeInstanceOf(QueryBuilder)
		expect(first.schema).toBe(Post)
		expect(first.ast.selection.fields).toStrictEqual([
			{ field: 'id', kind: 'selected-field' },
			{ field: 'title', kind: 'selected-field' },
		])
		expect(second.ast.selection.fields).toStrictEqual([])
		expect(first.ast.where).toBeUndefined()
	})

	it('attaches package statics to a specialized schema only', () => {
		const Specialized = Schema.defineSpecialized(
			{ className: 'CapabilitySource', fields: () => ({}) },
			(schema) => ({
				kind: 'specialized' as const,
				pointerTo: (id: string) => schema.pointer(id),
			}),
		)
		const source = materializeSchemaModel(Specialized, {
			id: '0198f090-2a50-7000-8000-000000000041',
		})

		expect(Specialized.kind).toBe('specialized')
		expect(Specialized.pointerTo('target').id).toBe('target')
		expect(source).toStrictEqual({ id: '0198f090-2a50-7000-8000-000000000041' })
		expect(() =>
			Schema.defineSpecialized(
				{ className: 'CapabilityCollision', fields: () => ({}) },
				() => ({ findMany: () => undefined }),
			),
		).toThrow(new TypeError('Reserved schema static capability: findMany'))
	})
})
