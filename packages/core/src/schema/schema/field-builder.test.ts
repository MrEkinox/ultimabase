import { describe, expect, it } from 'vitest'

import {
	createApplication,
	Schema,
	SchemaRegistry,
	stringField,
	type EmbeddedFieldBuilder,
	type FieldBuilder,
	type SchemaFieldBuilderDeclaration,
} from '../../index.js'

describe('FieldBuilder', () => {
	it('compiles the same metadata as the immutable field factories', () => {
		const reusableSlug = stringField({
			indexed: 'unique',
			validation: { required: true },
		})
		const SchemaWithFields = Schema.define({
			className: 'MetadataFromFieldBuilder',
			fields: (field) => ({
				published: field.boolean({ default: false }),
				profile: field.object({
					fields: (field) => ({
						displayName: field.string({
							validation: { length: { max: 80 } },
						}),
					}),
					typeName: 'BuilderMetadataProfile',
				}),
				slug: reusableSlug,
				title: field.string({ validation: { required: true } }),
			}),
		})

		new SchemaRegistry([SchemaWithFields]).compileSchemas()

		expect(SchemaWithFields.fields.slug).toBe(reusableSlug)
		expect(SchemaWithFields.fields.profile?.options).toMatchObject({
			fields: { displayName: { kind: 'string' } },
		})
	})

	it('delegates every built-in method to the existing immutable factories', async () => {
		const Target = Schema.define({
			className: 'BuilderTarget',
			fields: () => ({}),
		})
		const reusable = stringField({ validation: { required: true } })
		let rootBuilder: FieldBuilder | undefined
		let nestedBuilder: EmbeddedFieldBuilder | undefined
		const Built = Schema.define({
			className: 'BuiltWithFields',
			fields: (field) => {
				rootBuilder = field
				return {
					binary: field.binary(),
					day: field.date(),
					externalId: field.uuid(),
					metadata: field.json(),
					opensAt: field.time(),
					owner: field.pointer({ target: 'BuilderTarget' }),
					price: field.decimal(),
					profile: field.object({
						fields: (field) => {
							nestedBuilder = field
							return {
								age: field.int(),
								displayName: field.string(),
							}
						},
					}),
					published: field.boolean({ default: false }),
					publishedAt: field.dateTime(),
					score: field.float(),
					sequence: field.bigint(),
					slug: reusable,
					status: field.enum({ values: ['draft', 'published'] }),
					targets: field.relation({ target: 'BuilderTarget' }),
					title: field.string({ validation: { required: true } }),
					views: field.int({ default: 0 }),
				}
			},
		})

		await createApplication({ plugins: [], schemas: [Target, Built] })

		expect(
			Object.fromEntries(
				Object.entries(Built.fields).map(([name, field]) => [name, field.kind]),
			),
		).toMatchObject({
			binary: 'binary',
			day: 'date',
			externalId: 'uuid',
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
			views: 'int',
		})
		expect(Object.isFrozen(rootBuilder)).toBe(true)
		expect(Object.isFrozen(nestedBuilder)).toBe(true)
		expect(nestedBuilder).not.toHaveProperty('pointer')
		expect(nestedBuilder).not.toHaveProperty('relation')
	})

	it('reports complete paths for malformed returned maps', () => {
		expect(() =>
			Schema.define({
				className: 'EmptyBuilderFieldName',
				fields: (field) => ({ '': field.string() }),
			}),
		).toThrow(
			new TypeError(
				'EmptyBuilderFieldName.fields field name must be a non-empty string',
			),
		)
		const forgedDeclaration = (() => ({
			forged: { kind: 'string' },
		})) as unknown as SchemaFieldBuilderDeclaration
		expect(() =>
			Schema.define({
				className: 'ForgedBuilderField',
				fields: forgedDeclaration,
			}),
		).toThrow(
			new TypeError(
				'ForgedBuilderField.fields.forged must be a field definition',
			),
		)
	})

	it('requires callbacks to return a plain field map', () => {
		const missingReturnDeclaration = (() => () =>
			undefined) as unknown as SchemaFieldBuilderDeclaration
		expect(() =>
			Schema.define({
				className: 'MissingBuilderReturn',
				fields: missingReturnDeclaration,
			}),
		).toThrow(
			new TypeError('MissingBuilderReturn.fields must return a field map'),
		)
	})

	it('snapshots caller options once', () => {
		const validation = { length: { max: 20 } }
		const Snapshot = Schema.define({
			className: 'BuilderSnapshot',
			fields: (field) => ({ title: field.string({ validation }) }),
		})
		const registry = new SchemaRegistry([Snapshot])

		registry.compileSchemas()
		validation.length.max = 1

		expect(Snapshot.fields.title?.options).toMatchObject({
			validation: { length: { max: 20 } },
		})
		expect(Object.isFrozen(Snapshot.fields.title?.options ?? {})).toBe(true)
	})

	it('supports package-owned schema specialization callbacks', () => {
		const WithStatics = Schema.defineWithStatics(
			{
				className: 'BuilderWithStatics',
				fields: (field) => ({ title: field.string() }),
			},
			() => ({ source: 'statics' as const }),
		)
		const WithCapabilities = Schema.defineWithCapabilities(
			{
				className: 'BuilderWithCapabilities',
				fields: (field) => ({ title: field.string() }),
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
