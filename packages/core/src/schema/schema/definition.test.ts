import { describe, expect, it } from 'vitest'

import {
	defineContextualSchemaExtensionFactory,
	Schema,
	defineSchemaExtension,
	stringField,
	type SchemaExtension,
	type SchemaExtensionContextKind,
} from '../index.js'

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
			fields,
			extensions,
		})

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
			'fields',
			'indexes',
			'extensions',
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
			fields: {
				title: stringField(),
			},
		})

		// Consumers can inspect extensions without branching on optional metadata.
		expect(schema.extensions).toStrictEqual([])
		expect(Object.isFrozen(schema.extensions)).toBe(true)
	})

	it('binds contextual extension factories without changing runtime identity', () => {
		runtimeContextualFactoryCalls = 0
		const schema = Schema.define({
			className: 'ContextualPost',
			fields: { title: stringField({ validation: { required: true } }) },
			extensions: (context) => {
				expect(Object.isFrozen(context)).toBe(true)

				return [
					context.bind(runtimeContextualExtension, {
						readTitle: ({ title }) => title,
					}),
				]
			},
		})

		expect(runtimeContextualFactoryCalls).toBe(1)
		expect(Object.isFrozen(runtimeContextualExtension)).toBe(true)
		expect(schema.extensions[0].name).toBe('fixture.runtime-contextual')
		expect(schema.extensions[0].config.readTitle({ title: 'Visible' })).toBe(
			'Visible',
		)
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
			fields: { title: stringField() },
			extensions: [extension],
		})

		expect(schema.fields.privateValue).toBe(privateValue)
		expect(schema.indexes).toContainEqual({
			fields: ['privateValue'],
			unique: false,
		})
		expect(() =>
			Schema.define({
				className: 'CollidingPost',
				fields: { privateValue: stringField() },
				extensions: [extension],
			}),
		).toThrow(new TypeError('Reserved schema extension field: privateValue'))
	})

	it('finalizes package-owned static schema capabilities without wrapping identity', () => {
		const schema = Schema.defineWithStatics(
			{ className: 'SpecializedPost', fields: { title: stringField() } },
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
				{ className: 'InvalidStaticFactory', fields: {} },
				true as unknown as () => object,
			),
		).toThrow(new TypeError('createCapabilities must be a function'))
		expect(() =>
			Schema.defineWithStatics(
				{ className: 'InvalidStaticResult', fields: {} },
				() => [],
			),
		).toThrow(
			new TypeError('schema static capabilities must be a plain object'),
		)
		expect(() =>
			Schema.defineWithStatics(
				{ className: 'CollidingStatic', fields: {} },
				() => ({ findMany: true }),
			),
		).toThrow(new TypeError('Reserved schema static capability: findMany'))
	})

	it.each(['id', 'createdAt', 'updatedAt', 'AND', 'OR', 'NOT'] as const)(
		'rejects the reserved %s field',
		(name) => {
			const field = stringField()
			const fields: Record<string, typeof field> = {
				[name]: field,
			}

			expect(() =>
				Schema.define({
					className: 'Invalid',
					fields,
				}),
			).toThrow(new TypeError(`Reserved schema field: ${name}`))
		},
	)

	it.each([
		'create',
		'delete',
		'get',
		'relation',
		'then',
		'toJSON',
		'update',
		'upsert',
	])('rejects the reserved model member %s', (name) => {
		expect(() =>
			Schema.define({
				className: 'InvalidModel',
				fields: { [name]: stringField() },
			}),
		).toThrow(new TypeError(`Reserved schema model field: ${name}`))
	})
})
