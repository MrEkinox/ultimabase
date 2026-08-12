import { describe, expect, it } from 'vitest'

import {
	defineContextualSchemaExtensionFactory,
	Schema,
	SchemaRegistry,
	defineSchemaExtension,
	stringField,
	type SchemaExtension,
	type SchemaExtensionContextKind,
} from '../index.js'
import {
	reservedQueryLogicalFieldNames,
	reservedSchemaModelFieldNames,
} from './reserved-field-names.js'
import { reservedSystemFieldNames } from './system-fields.js'

interface RuntimeContextualOptions<
	TData extends Readonly<Record<string, unknown>>,
> {
	readonly readTitle: (data: TData) => string
}

type RuntimeContextualExtension<
	TData extends Readonly<Record<string, unknown>>,
> = SchemaExtension<
	'fixture.runtime-contextual',
	RuntimeContextualOptions<TData>
>

type RuntimeContextualData<TData> =
	TData extends Readonly<Record<string, unknown>> ? TData : never

interface RuntimeContextualKind extends SchemaExtensionContextKind {
	readonly options: RuntimeContextualOptions<
		RuntimeContextualData<this['data']>
	>
	readonly extension: RuntimeContextualExtension<
		RuntimeContextualData<this['data']>
	>
}

let runtimeContextualFactoryCalls = 0
const createRuntimeContextualExtension = <
	TData extends Readonly<Record<string, unknown>>,
>(
	options: RuntimeContextualOptions<TData>,
): RuntimeContextualExtension<TData> => {
	runtimeContextualFactoryCalls += 1

	return defineSchemaExtension('fixture.runtime-contextual', options)
}
const runtimeContextualExtension =
	defineContextualSchemaExtensionFactory<RuntimeContextualKind>()(
		createRuntimeContextualExtension,
	)

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
		const extension = defineSchemaExtension('fixture.permissions', {
			mode: 'strict',
		})
		const extensions = [extension]
		const schema = Schema.define({
			className: 'Post',
			fields: () => fields,
			extensions,
		})
		new SchemaRegistry([schema]).compileSchemas()

		fields.summary = stringField()
		extensions.push(extension)

		expect(schema.className).toBe('Post')
		expect(schema.name).toBe('Post')
		expect(typeof schema).toBe('function')
		expect(Schema.is(schema)).toBe(true)
		expect(Schema.is(schema.definition)).toBe(false)
		expect(Schema.is({ className: 'Post', fields: schema.fields })).toBe(false)
		expect(schema.fields.title).toBe(title)
		expect(schema.definition.fields).toBe(schema.fields)
		expect(schema.definition.indexes).toBe(schema.indexes)
		expect(schema.definition.extensions).toBe(schema.extensions)
		expect(schema.fields).not.toHaveProperty('summary')
		expect(schema.extensions).toStrictEqual([extension])
		expect(Object.keys(schema)).toStrictEqual([
			'definition',
			'className',
			'constraints',
			'fields',
			'indexes',
			'extensions',
			'provenance',
		])
		expect(Object.isFrozen(schema)).toBe(true)
		expect(Object.isFrozen(schema.definition)).toBe(true)
		expect(Object.isFrozen(schema.prototype)).toBe(true)
		expect(Object.isFrozen(schema.fields)).toBe(true)
		expect(Object.isFrozen(schema.extensions)).toBe(true)
		expect(Reflect.set(schema, 'className', 'Changed')).toBe(false)
		expect(Reflect.set(schema.fields, 'title', stringField())).toBe(false)
	})

	it('normalizes omitted extensions to one immutable empty list', () => {
		const schema = Schema.define({
			className: 'Post',
			fields: (field) => ({
				title: field.string(),
			}),
		})
		new SchemaRegistry([schema]).compileSchemas()

		// Consumers can inspect extensions without branching on optional metadata.
		expect(schema.extensions).toStrictEqual([])
		expect(Object.isFrozen(schema.extensions)).toBe(true)
	})

	it('binds contextual extension factories without changing runtime identity', () => {
		runtimeContextualFactoryCalls = 0
		const schema = Schema.define({
			className: 'ContextualPost',
			fields: (field) => ({
				title: field.string({ validation: { required: true } }),
			}),
			extensions: (context) => {
				expect(Object.isFrozen(context)).toBe(true)

				return [
					context.bind(runtimeContextualExtension, {
						readTitle: ({ title }) => {
							if (typeof title !== 'string') {
								throw new TypeError('Expected a string title')
							}
							return title
						},
					}),
				]
			},
		})
		new SchemaRegistry([schema]).compileSchemas()

		expect(runtimeContextualFactoryCalls).toBe(1)
		expect(Object.isFrozen(runtimeContextualExtension)).toBe(true)
		const [extension] = schema.extensions
		const extensionConfig: unknown = extension?.config
		if (
			extension === undefined ||
			typeof extensionConfig !== 'object' ||
			extensionConfig === null ||
			!('readTitle' in extensionConfig) ||
			typeof extensionConfig.readTitle !== 'function'
		) {
			throw new TypeError('Expected the contextual extension to be compiled')
		}

		expect(extension.name).toBe('fixture.runtime-contextual')
		const readTitle = extensionConfig.readTitle as (input: {
			readonly title: string
		}) => unknown
		expect(readTitle({ title: 'Visible' })).toBe('Visible')
		expect(Object.isFrozen(schema.extensions)).toBe(true)
	})

	it('merges extension-owned fields and rejects every reserved collision', () => {
		const privateValue = stringField({
			indexed: true,
			validation: { required: true },
		})
		const extension = defineSchemaExtension(
			'fixture.storage',
			{},
			'fixture.plugin',
			{ fields: { privateValue } },
		)
		const schema = Schema.define({
			className: 'ExtendedPost',
			fields: (field) => ({ title: field.string() }),
			extensions: [extension],
		})
		new SchemaRegistry([schema]).compileSchemas()

		expect(schema.fields.privateValue).toBe(privateValue)
		expect(schema.indexes).toContainEqual({
			fields: ['privateValue'],
			unique: false,
		})
		expect(() => {
			const collidingSchema = Schema.define({
				className: 'CollidingPost',
				fields: (field) => ({ privateValue: field.string() }),
				extensions: [extension],
			})
			new SchemaRegistry([collidingSchema]).compileSchemas()
		}).toThrow(new TypeError('Reserved schema extension field: privateValue'))
	})

	it('finalizes package-owned static schema capabilities without wrapping identity', () => {
		const schema = Schema.defineWithStatics(
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
			Schema.defineWithStatics(
				{ className: 'InvalidStaticFactory', fields: () => ({}) },
				true as unknown as () => object,
			),
		).toThrow(new TypeError('createCapabilities must be a function'))
		expect(() =>
			Schema.defineWithStatics(
				{ className: 'InvalidStaticResult', fields: () => ({}) },
				() => [],
			),
		).toThrow(
			new TypeError('schema static capabilities must be a plain object'),
		)
		expect(() =>
			Schema.defineWithStatics(
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

	it.each([
		...reservedSystemFieldNames,
		...reservedQueryLogicalFieldNames,
		...reservedSchemaModelFieldNames,
	])('rejects the reserved dynamic extension field %s at runtime', (name) => {
		expect(() => {
			const field = stringField()
			const fields: Record<string, typeof field> = { [name]: field }
			const extension = defineSchemaExtension(
				`fixture.reserved.${name}`,
				{},
				'fixture.reserved',
				{ fields },
			)
			const schema = Schema.define({
				className: `ReservedExtension${name}`,
				fields: () => ({}),
				extensions: [extension],
			})

			new SchemaRegistry([schema]).compileSchemas()
		}).toThrow(new TypeError(`Reserved schema extension field: ${name}`))
	})
})
