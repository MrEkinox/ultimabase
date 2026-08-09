import { describe, expect, it } from 'vitest'

import {
	createApplication,
	intField,
	pointerField,
	Schema,
	SchemaCompilationError,
	SchemaRegistry,
	stringField,
	type EmbeddedFieldBuilder,
	type FieldBuilder,
} from '../../index.js'

describe('FieldBuilder', () => {
	it('delegates every built-in method to the existing immutable factories', async () => {
		const Target = Schema.define({ className: 'BuilderTarget', fields: {} })
		const reusable = stringField({ validation: { required: true } })
		let rootBuilder: FieldBuilder | undefined
		let nestedBuilder: EmbeddedFieldBuilder | undefined
		const Built = Schema.define({
			className: 'BuiltWithFields',
			fields(field) {
				rootBuilder = field
				field.string('title', { validation: { required: true } })
				field.boolean('published', { default: false })
				field.int('views', { default: 0 })
				field.bigint('sequence')
				field.float('score')
				field.decimal('price')
				field.uuid('externalId')
				field.date('day')
				field.dateTime('publishedAt')
				field.time('opensAt')
				field.binary('content')
				field.json('metadata')
				field.enum('status', { values: ['draft', 'published'] })
				field.object('profile', {
					fields(field) {
						nestedBuilder = field
						field.string('displayName')
						field.int('age')
					},
				})
				field.pointer('owner', { target: () => Target })
				field.relation('targets', { target: () => Target })
				field.add('slug', reusable)
			},
		})

		await createApplication({ plugins: [], schemas: [Target, Built] })

		expect(
			Object.fromEntries(
				Object.entries(Built.fields).map(([name, field]) => [name, field.kind]),
			),
		).toStrictEqual({
			content: 'binary',
			createdAt: 'dateTime',
			day: 'date',
			externalId: 'uuid',
			id: 'uuid',
			metadata: 'json',
			opensAt: 'time',
			owner: 'pointer',
			price: 'decimal',
			profile: 'object',
			published: 'boolean',
			publishedAt: 'dateTime',
			score: 'float',
			sequence: 'bigint',
			slug: 'string',
			status: 'enum',
			targets: 'relation',
			title: 'string',
			updatedAt: 'dateTime',
			views: 'int',
		})
		expect(Built.fields.slug).toBe(reusable)
		const profile = Built.fields.profile

		if (profile === undefined) {
			throw new TypeError('Compiled profile field is missing')
		}

		expect(Reflect.get(profile.options, 'fields')).toMatchObject({
			age: { kind: 'int' },
			displayName: { kind: 'string' },
		})
		expect(Object.isFrozen(rootBuilder)).toBe(true)
		expect(Object.isFrozen(nestedBuilder)).toBe(true)
		expect(nestedBuilder).not.toHaveProperty('pointer')
		expect(nestedBuilder).not.toHaveProperty('relation')
	})

	it('reports complete paths for duplicate and malformed declarations', async () => {
		const Duplicate = Schema.define({
			className: 'DuplicateBuilderField',
			fields(field) {
				field.string('title')
				field.string('title')
			},
		})

		await expect(
			createApplication({ plugins: [], schemas: [Duplicate] }),
		).rejects.toThrow(
			expect.objectContaining({
				cause: new TypeError(
					'Duplicate field declaration: DuplicateBuilderField.fields.title',
				),
				reason: 'callback-threw',
			}),
		)

		const InvalidNested = Schema.define({
			className: 'InvalidNestedBuilder',
			fields(field) {
				field.object('profile', {
					fields: () => ({ invalid: stringField() }),
				})
			},
		})

		await expect(
			createApplication({ plugins: [], schemas: [InvalidNested] }),
		).rejects.toThrow(
			expect.objectContaining({
				cause: new TypeError(
					'InvalidNestedBuilder.fields.profile.fields must not return a value',
				),
			}),
		)

		const EmptyName = Schema.define({
			className: 'EmptyBuilderFieldName',
			fields(field) {
				field.string('')
			},
		})

		await expect(
			createApplication({ plugins: [], schemas: [EmptyName] }),
		).rejects.toThrow(
			expect.objectContaining({
				cause: new TypeError(
					'EmptyBuilderFieldName.fields field name must be a non-empty string',
				),
			}),
		)

		const NonStringName = Schema.define({
			className: 'NonStringBuilderFieldName',
			fields(field) {
				Reflect.apply(field.string, field, [42])
			},
		})

		await expect(
			createApplication({ plugins: [], schemas: [NonStringName] }),
		).rejects.toThrow(
			expect.objectContaining({
				cause: new TypeError(
					'NonStringBuilderFieldName.fields field name must be a non-empty string',
				),
			}),
		)

		const Reserved = Schema.define({
			className: 'ReservedBuilderField',
			fields(field) {
				field.string('id')
			},
		})

		await expect(
			createApplication({ plugins: [], schemas: [Reserved] }),
		).rejects.toThrow(new TypeError('Reserved schema field: id'))

		const ForgedField = Schema.define({
			className: 'ForgedBuilderField',
			fields(field) {
				Reflect.apply(field.add, field, ['forged', { kind: 'string' }])
			},
		})

		await expect(
			createApplication({ plugins: [], schemas: [ForgedField] }),
		).rejects.toThrow(
			expect.objectContaining({
				cause: new TypeError(
					'ForgedBuilderField.fields.forged must be a field definition',
				),
			}),
		)
	})

	it('keeps relationship and generated-column capabilities top-level only', async () => {
		const Target = Schema.define({
			className: 'NestedRestrictionTarget',
			fields: {},
		})
		const InvalidPointer = Schema.define({
			className: 'NestedPointerBuilder',
			fields(field) {
				field.object('profile', {
					fields(field) {
						Reflect.apply(field.add, field, [
							'owner',
							pointerField({ target: () => Target }),
						])
					},
				})
			},
		})

		await expect(
			createApplication({
				plugins: [],
				schemas: [Target, InvalidPointer],
			}),
		).rejects.toThrow(
			expect.objectContaining({
				cause: new TypeError(
					'fields.owner cannot be a pointer or relation inside objectField',
				),
			}),
		)

		const InvalidSequence = Schema.define({
			className: 'NestedSequenceBuilder',
			fields(field) {
				field.object('profile', {
					fields(field) {
						Reflect.apply(field.add, field, [
							'sequence',
							intField({ autoIncrement: true }),
						])
					},
				})
			},
		})

		await expect(
			createApplication({ plugins: [], schemas: [InvalidSequence] }),
		).rejects.toThrow(
			expect.objectContaining({
				cause: new TypeError(
					'fields.sequence cannot use autoIncrement inside objectField',
				),
			}),
		)
	})

	it('snapshots caller options once and rejects mixed callback styles', () => {
		const validation = { length: { max: 20 } }
		const Snapshot = Schema.define({
			className: 'BuilderSnapshot',
			fields(field) {
				field.string('title', { validation })
			},
		})
		const registry = new SchemaRegistry([Snapshot])

		registry.compileSchemas()
		validation.length.max = 1

		const title = Snapshot.fields.title

		if (title === undefined) {
			throw new TypeError('Compiled title field is missing')
		}

		expect(Reflect.get(title.options, 'validation')).toMatchObject({
			length: { max: 20 },
		})
		expect(Object.isFrozen(title.options)).toBe(true)

		const Mixed = Schema.define({
			className: 'MixedBuilderDeclaration',
			fields: (field: FieldBuilder) => {
				field.string('title')

				return { slug: stringField() }
			},
		})

		expect(() => new SchemaRegistry([Mixed]).compileSchemas()).toThrow(
			SchemaCompilationError,
		)
	})

	it('supports package-owned schema specialization callbacks', () => {
		const WithStatics = Schema.defineWithStatics(
			{
				className: 'BuilderWithStatics',
				fields(field) {
					field.string('title')
				},
			},
			() => ({ source: 'statics' as const }),
		)
		const WithCapabilities = Schema.defineWithCapabilities(
			{
				className: 'BuilderWithCapabilities',
				fields(field) {
					field.string('title')
				},
			},
			() => ({ results: {}, statics: { source: 'capabilities' as const } }),
		)

		new SchemaRegistry([WithStatics, WithCapabilities]).compileSchemas()

		expect(WithStatics.source).toBe('statics')
		expect(WithCapabilities.source).toBe('capabilities')
		expect(WithStatics.fields.title?.kind).toBe('string')
		expect(WithCapabilities.fields.title?.kind).toBe('string')
	})
})
