import { expectTypeOf, test } from 'vitest'

import {
	defineFieldExtension,
	defineFieldKindHookTarget,
	definePlugin,
	definePluginField,
	defineSchemaExtension,
	objectField,
	Schema,
	stringField,
} from '../index.js'

const schemaExtension = defineSchemaExtension(
	'fixture.schema-hooks',
	{ mode: 'strict' as const },
	'fixture.hooks',
)
const fieldExtension = defineFieldExtension(
	'fixture.field-hooks',
	{ redact: true as const },
	'fixture.hooks',
)
const urlNormalizers = {
	snapshotValue: (value: unknown): URL => new URL(String(value)),
}
const schema = Schema.define({
	className: 'PluginHookTarget',
	fields: {
		endpoint: definePluginField('fixture.url', {}, urlNormalizers),
		profile: objectField({
			fields: {
				displayName: stringField(),
			},
		}),
		tags: stringField({
			list: true,
			extensions: [fieldExtension],
		}),
		title: stringField({ validation: { required: true } }),
	},
	extensions: [schemaExtension],
})
const urlKindTarget =
	defineFieldKindHookTarget<typeof schema.fields.endpoint>('fixture.url')

test('infers setup hook targets and exact schema or field handlers', () => {
	definePlugin({
		name: 'fixture.hooks',
		setup: ({ hooks }) => {
			hooks.global('global', {
				beforeOperation: { create: ({ operation }) => void operation },
			})
			hooks.schema('schema', schema, {
				beforeOperation: {
					create: ({ operation }) => {
						if (operation.kind === 'create-one') {
							expectTypeOf(operation.input.title).toEqualTypeOf<string>()
						} else {
							expectTypeOf(operation.inputs[0]?.title).toEqualTypeOf<
								string | undefined
							>()
						}
						void operation
					},
				},
			})
			hooks.field('listed-nullable', schema, ['tags'], {
				resolveInput: ({ value }) => {
					expectTypeOf(value).toEqualTypeOf<readonly string[] | null>()
					return value
				},
			})
			hooks.field('nested-object', schema, ['profile'], {
				resolveInput: ({ value }) => {
					expectTypeOf(value?.displayName).toEqualTypeOf<
						string | null | undefined
					>()
					return value
				},
			})
			hooks.field('nested-scalar', schema, ['profile', 'displayName'], {
				resolveInput: ({ value }) => {
					expectTypeOf(value).toEqualTypeOf<string | null>()
					return value
				},
			})
			hooks.field('custom', schema, ['endpoint'], {
				resolveInput: ({ value }) => {
					expectTypeOf(value).toEqualTypeOf<URL | null>()
					return value
				},
			})
			hooks.schemaExtension('schema-extension', schemaExtension, (context) => {
				expectTypeOf(context.extension.config.mode).toEqualTypeOf<'strict'>()
				return {
					beforeOperation: { create: ({ operation }) => void operation },
				}
			})
			hooks.fieldExtension('field-extension', fieldExtension, (context) => {
				expectTypeOf(context.extension.config.redact).toEqualTypeOf<true>()
				return { resolveInput: ({ value }) => value }
			})
			hooks.fieldKind('field-kind', urlKindTarget, ({ field }) => {
				expectTypeOf(field).toEqualTypeOf<typeof schema.fields.endpoint>()
				return {
					resolveInput: ({ value }) => {
						expectTypeOf(value).toEqualTypeOf<URL | null>()
						return value
					},
				}
			})
		},
	})
})

test('rejects invalid paths, extension scopes, and mismatched kind tokens', () => {
	definePlugin({
		name: 'fixture.hooks',
		setup: ({ hooks }) => {
			// @ts-expect-error -- Exact field targets require a non-empty path.
			hooks.field('empty', schema, [], {})
			// @ts-expect-error -- Undeclared fields are absent from the exact path union.
			hooks.field('missing', schema, ['missing'], {})
			// @ts-expect-error -- Scalar declarations cannot be traversed as objects.
			hooks.field('scalar-child', schema, ['title', 'child'], {})
			// @ts-expect-error -- Schema-extension targets reject field extensions.
			hooks.schemaExtension('wrong-scope', fieldExtension, () => ({}))
			// @ts-expect-error -- Field-extension targets reject schema extensions.
			hooks.fieldExtension('wrong-scope', schemaExtension, () => ({}))
		},
	})

	// @ts-expect-error -- A kind token must match its declared custom field type.
	defineFieldKindHookTarget<typeof schema.fields.endpoint>('fixture.other')
})
