import { describe, expect, it } from 'vitest'

import { Schema, SchemaRegistry, stringField } from '../index.js'
import {
	reservedQueryLogicalFieldNames,
	reservedSchemaModelFieldNames,
} from './reserved-field-names.js'
import { reservedSystemFieldNames } from './system-fields.js'

type EmptyCapabilities = Readonly<Record<never, never>>

describe('schema definitions', () => {
	it('keeps Schema itself as a non-constructible static declaration facade', () => {
		expect((): void => {
			Reflect.construct(Schema, [])
		}).toThrow(
			new TypeError('Use Schema.define() to declare a schema model class'),
		)
	})

	it('copies and freezes developer-owned declaration containers', () => {
		const title = stringField()
		const fields: Record<string, typeof title> = { title }
		const schema = Schema.define({
			className: 'Post',
			fields: () => fields,
		})
		new SchemaRegistry([schema]).compileSchemas()

		fields.summary = stringField()
		expect(schema.className).toBe('Post')
		expect(schema.name).toBe('Post')
		expect(typeof schema).toBe('function')
		expect(Schema.is(schema)).toBe(true)
		expect(Schema.is(schema.definition)).toBe(false)
		expect(Schema.is({ className: 'Post', fields: schema.fields })).toBe(false)
		expect(schema.fields.title).toBe(title)
		expect(schema.definition.fields).toBe(schema.fields)
		expect(schema.definition.indexes).toBe(schema.indexes)
		expect(schema.fields).not.toHaveProperty('summary')
		expect(Object.keys(schema)).toStrictEqual([
			'definition',
			'className',
			'constraints',
			'fields',
			'indexes',
			'persistedFields',
			'provenance',
			'virtualFields',
		])
		expect(Object.isFrozen(schema)).toBe(true)
		expect(Object.isFrozen(schema.definition)).toBe(true)
		expect(Object.isFrozen(schema.prototype)).toBe(true)
		expect(Object.isFrozen(schema.fields)).toBe(true)
		expect(Reflect.set(schema, 'className', 'Changed')).toBe(false)
		expect(Reflect.set(schema.fields, 'title', stringField())).toBe(false)
	})

	it('finalizes package-owned schema capabilities without wrapping identity', () => {
		const schema = Schema.defineSpecialized(
			{
				className: 'SpecializedPost',
				fields: (field) => ({ title: field.string() }),
			},
			({ schema: exactSchema }) => ({
				results: {},
				statics: { byId: (id: string) => exactSchema.pointer(id) },
			}),
		)

		expect(Schema.is(schema)).toBe(true)
		expect(schema.byId('post-1').schema).toBe(schema)
		expect(Object.keys(schema)).not.toContain('byId')
		expect(Object.isFrozen(schema)).toBe(true)
	})

	it('rejects invalid or colliding package-owned static capabilities', () => {
		expect(() =>
			Schema.defineSpecialized(
				{ className: 'InvalidStaticFactory', fields: () => ({}) },
				true as unknown as () => {
					readonly results: EmptyCapabilities
					readonly statics: EmptyCapabilities
				},
			),
		).toThrow(new TypeError('createCapabilities must be a function'))
		expect(() =>
			Schema.defineSpecialized(
				{ className: 'InvalidStaticResult', fields: () => ({}) },
				() =>
					[] as unknown as {
						readonly results: EmptyCapabilities
						readonly statics: EmptyCapabilities
					},
			),
		).toThrow(new TypeError('schema class capabilities must be a plain object'))
		expect(() =>
			Schema.defineSpecialized(
				{ className: 'CollidingStatic', fields: () => ({}) },
				() => ({ results: {}, statics: { findMany: true } }),
			),
		).toThrow(new TypeError('Reserved schema static capability: findMany'))
	})

	it.each([...reservedSystemFieldNames, ...reservedQueryLogicalFieldNames])(
		'rejects the reserved %s field',
		(name) => {
			const field = stringField()
			const fields: Record<string, typeof field> = {
				[name]: field,
			}

			expect(() => {
				const schema = Schema.define({
					className: 'Invalid',
					fields: () => fields,
				})
				new SchemaRegistry([schema]).compileSchemas()
			}).toThrow(new TypeError(`Reserved schema field: ${name}`))
		},
	)

	it.each(reservedSchemaModelFieldNames)(
		'rejects the reserved model member %s',
		(name) => {
			expect(() => {
				const schema = Schema.define({
					className: 'InvalidModel',
					fields: (field) => ({ [name]: field.string() }),
				})
				new SchemaRegistry([schema]).compileSchemas()
			}).toThrow(new TypeError(`Reserved schema model field: ${name}`))
		},
	)
})
