import { describe, expect, it } from 'vitest'

import { UltimaBase } from '../../runtime/application/ultima-base.js'
import { Schema, SchemaRegistry, stringField } from '../index.js'
import {
	reservedQueryLogicalFieldNames,
	reservedSchemaModelFieldNames,
} from './reserved-field-names.js'
import { reservedSystemFieldNames } from './system-fields.js'

type EmptyCapabilities = Readonly<Record<never, never>>

describe('schema definitions', () => {
	it('keeps Schema itself as a non-constructible specialization facade', () => {
		expect((): void => {
			Reflect.construct(Schema, [])
		}).toThrow(
			new TypeError(
				'Use UltimaBase.Schema.define() to declare a schema model class',
			),
		)
	})

	it('copies and freezes developer-owned declaration containers', () => {
		const title = stringField()
		const fields: Record<string, typeof title> = { title }
		const schema = UltimaBase.Schema.define({
			className: 'Post',
			fields: () => fields,
		})
		new SchemaRegistry([schema]).compileSchemas()

		fields.summary = stringField()
		expect(schema.className).toBe('Post')
		expect(Reflect.get(schema, 'name')).toBe('Post')
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
			'fields',
			'indexes',
			'persistedFields',
			'provenance',
			'virtualFields',
		])
		expect(Object.isFrozen(schema)).toBe(true)
		expect(Object.isFrozen(schema.definition)).toBe(true)
		expect(Object.isFrozen(Reflect.get(schema, 'prototype'))).toBe(true)
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
			(exactSchema) => ({
				byId: (id: string) => exactSchema.pointer(id),
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
				true as unknown as () => EmptyCapabilities,
			),
		).toThrow(new TypeError('createStatics must be a function'))
		expect(() =>
			Schema.defineSpecialized(
				{ className: 'InvalidStaticResult', fields: () => ({}) },
				() => [],
			),
		).toThrow(
			new TypeError('schema static capabilities must be a plain object'),
		)
		expect(() =>
			Schema.defineSpecialized(
				{ className: 'CollidingStatic', fields: () => ({}) },
				() => ({ findMany: true }),
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
				const schema = UltimaBase.Schema.define({
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
				const schema = UltimaBase.Schema.define({
					className: 'InvalidModel',
					fields: (field) => ({ [name]: field.string() }),
				})
				new SchemaRegistry([schema]).compileSchemas()
			}).toThrow(new TypeError(`Reserved schema model field: ${name}`))
		},
	)
})
