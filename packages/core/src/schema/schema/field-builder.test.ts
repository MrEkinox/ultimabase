import { describe, expect, it } from 'vitest'

import {
	createApplication,
	Schema,
	SchemaRegistry,
	stringField,
	type EmbeddedFieldBuilder,
	type FieldBuilder,
	type GenericField,
	type SchemaFieldBuilderDeclaration,
} from '../../index.js'

interface InvalidEmbeddedFieldCase {
	readonly build: (field: EmbeddedFieldBuilder) => GenericField
	readonly methodName: string
}

const captureCauseMessage = (operation: () => unknown): string => {
	try {
		operation()
	} catch (error: unknown) {
		if (!(error instanceof Error) || !(error.cause instanceof Error)) {
			throw error
		}

		let cause = error.cause
		while (cause.cause instanceof Error) cause = cause.cause

		return cause.message
	}

	throw new TypeError('Expected an error with a cause')
}

describe('FieldBuilder', () => {
	it('compiles the same metadata as the immutable field factories', () => {
		const reusableSlug = stringField({
			indexed: 'unique',
			required: true,
		})
		const SchemaWithFields = Schema.define({
			className: 'MetadataFromFieldBuilder',
			fields: (field) => ({
				published: field.boolean({ default: false }),
				profile: field.object({
					fields: (field) => ({
						displayName: field.string(),
					}),
					typeName: 'BuilderMetadataProfile',
				}),
				slug: reusableSlug,
				title: field.string({ required: true }),
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
		const reusable = stringField({ required: true })
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
					title: field.string({ required: true }),
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

	it('rejects root-only Core options on every embedded built-in method', () => {
		const cases: readonly InvalidEmbeddedFieldCase[] = [
			{
				build: (field) =>
					field.bigint({
						// @ts-expect-error -- Exercises the runtime boundary for stale JavaScript.
						indexed: true,
					}),
				methodName: 'bigint',
			},
			{
				build: (field) =>
					field.binary({
						// @ts-expect-error -- Exercises the runtime boundary for stale JavaScript.
						indexed: true,
					}),
				methodName: 'binary',
			},
			{
				build: (field) =>
					field.boolean({
						// @ts-expect-error -- Exercises the runtime boundary for stale JavaScript.
						indexed: true,
					}),
				methodName: 'boolean',
			},
			{
				build: (field) =>
					field.date({
						// @ts-expect-error -- Exercises the runtime boundary for stale JavaScript.
						indexed: true,
					}),
				methodName: 'date',
			},
			{
				build: (field) =>
					field.dateTime({
						// @ts-expect-error -- Exercises the runtime boundary for stale JavaScript.
						indexed: true,
					}),
				methodName: 'dateTime',
			},
			{
				build: (field) =>
					field.decimal({
						// @ts-expect-error -- Exercises the runtime boundary for stale JavaScript.
						indexed: true,
					}),
				methodName: 'decimal',
			},
			{
				build: (field) =>
					field.enum({
						// @ts-expect-error -- Exercises the runtime boundary for stale JavaScript.
						indexed: true,
						values: ['draft'],
					}),
				methodName: 'enum',
			},
			{
				build: (field) =>
					field.float({
						// @ts-expect-error -- Exercises the runtime boundary for stale JavaScript.
						indexed: true,
					}),
				methodName: 'float',
			},
			{
				build: (field) =>
					field.int({
						// @ts-expect-error -- Exercises the runtime boundary for stale JavaScript.
						indexed: true,
					}),
				methodName: 'int',
			},
			{
				build: (field) =>
					field.json({
						// @ts-expect-error -- Exercises the runtime boundary for stale JavaScript.
						indexed: true,
					}),
				methodName: 'json',
			},
			{
				build: (field) =>
					field.object({
						fields: () => ({}),
						// @ts-expect-error -- Exercises the runtime boundary for stale JavaScript.
						indexed: true,
					}),
				methodName: 'object',
			},
			{
				build: (field) =>
					field.string({
						// @ts-expect-error -- Exercises the runtime boundary for stale JavaScript.
						indexed: true,
					}),
				methodName: 'string',
			},
			{
				build: (field) =>
					field.time({
						// @ts-expect-error -- Exercises the runtime boundary for stale JavaScript.
						indexed: true,
					}),
				methodName: 'time',
			},
			{
				build: (field) =>
					field.uuid({
						// @ts-expect-error -- Exercises the runtime boundary for stale JavaScript.
						indexed: true,
					}),
				methodName: 'uuid',
			},
		]

		for (const { build, methodName } of cases) {
			const className = `IndexedEmbedded${methodName}`

			expect(
				captureCauseMessage(() =>
					Schema.define({
						className,
						fields: (field) => ({
							profile: field.object({
								fields: (embedded) => ({
									value: build(embedded),
								}),
							}),
						}),
					}),
				),
			).toBe(
				`${className}.fields.profile.object.fields.value cannot use indexed inside objectField`,
			)
		}
	})

	it('rejects disabled sequence and system generation options when embedded', () => {
		const cases: readonly (InvalidEmbeddedFieldCase & {
			readonly optionName: string
		})[] = [
			{
				build: (field) =>
					field.int({
						// @ts-expect-error -- Disabled root metadata remains invalid.
						autoIncrement: false,
					}),
				methodName: 'int',
				optionName: 'autoIncrement',
			},
			{
				build: (field) =>
					field.bigint({
						// @ts-expect-error -- Disabled root metadata remains invalid.
						autoIncrement: false,
					}),
				methodName: 'bigint',
				optionName: 'autoIncrement',
			},
			{
				build: (field) =>
					field.dateTime({
						// @ts-expect-error -- System generation has no embedded meaning.
						generatedOn: 'create',
					}),
				methodName: 'dateTime',
				optionName: 'generatedOn',
			},
		]

		for (const { build, methodName, optionName } of cases) {
			const className = `GeneratedEmbedded${methodName}`

			expect(
				captureCauseMessage(() =>
					Schema.define({
						className,
						fields: (field) => ({
							profile: field.object({
								fields: (embedded) => ({
									value: build(embedded),
								}),
							}),
						}),
					}),
				),
			).toBe(
				`${className}.fields.profile.object.fields.value cannot use ${optionName} inside objectField`,
			)
		}
	})

	it('retains embedded occurrence and value-shape behavior recursively', () => {
		const EmbeddedBehavior = Schema.define({
			className: 'EmbeddedBehavior',
			fields: (field) => ({
				profile: field.object({
					fields: (embedded) => ({
						label: embedded.string({
							default: 'Anonymous',
							description: 'Displayed label',
							immutable: true,
							required: true,
						}),
						refreshedAt: embedded.dateTime({
							autoNow: true,
							timezone: true,
						}),
						settings: embedded.object({
							fields: (child) => ({
								tags: child.string({ default: ['core'], list: true }),
							}),
							required: true,
							typeName: 'EmbeddedSettings',
						}),
					}),
				}),
			}),
		})

		new SchemaRegistry([EmbeddedBehavior]).compileSchemas()
		const profile = EmbeddedBehavior.fields.profile
		if (profile?.kind !== 'object') {
			throw new TypeError('Expected compiled profile object')
		}

		expect(profile.options).toMatchObject({
			fields: {
				label: {
					options: {
						default: 'Anonymous',
						description: 'Displayed label',
						immutable: true,
						required: true,
					},
				},
				refreshedAt: { options: { autoNow: true, timezone: true } },
				settings: {
					options: { required: true, typeName: 'EmbeddedSettings' },
				},
			},
		})
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
