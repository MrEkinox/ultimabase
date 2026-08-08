import { expectTypeOf, test } from 'vitest'

import {
	Schema,
	defineFieldExtension,
	defineFieldKindAccessTarget,
	definePlugin,
	definePluginField,
	defineSchemaExtension,
	objectField,
	stringField,
} from '../index.js'

const schemaExtension = defineSchemaExtension(
	'fixture.schema-access',
	{ mode: 'strict' as const },
	'fixture.access',
)
const fieldExtension = defineFieldExtension(
	'fixture.field-access',
	{ redact: true as const },
	'fixture.access',
)
const schema = Schema.define({
	className: 'TypedPluginAccessTarget',
	fields: {
		endpoint: definePluginField(
			'fixture.access-url',
			{},
			{
				snapshotValue: (value: unknown): URL => new URL(String(value)),
			},
		),
		profile: objectField({
			fields: { displayName: stringField() },
		}),
		title: stringField({ validation: { required: true } }),
	},
	extensions: [schemaExtension],
})
const urlTarget =
	defineFieldKindAccessTarget<typeof schema.fields.endpoint>(
		'fixture.access-url',
	)

test('infers exact schema and field Access policy targets', () => {
	definePlugin({
		name: 'fixture.access',
		setup: ({ access }) => {
			access.global(
				'global',
				{
					operation: {
						read: ({ context }) => context.access.mode !== 'master',
					},
				},
				{ master: 'bypass' },
			)
			access.schema(
				'schema',
				schema,
				{
					filter: {
						read: ({ where }) => where.eq('title', 'Visible'),
					},
				},
				{ master: 'enforce' },
			)
			access.field(
				'nested-field',
				schema,
				['profile', 'displayName'],
				{
					create: ({ value }) => {
						expectTypeOf(value).toEqualTypeOf<string | null>()

						return value !== null && value.length > 0
					},
				},
				{ master: 'enforce' },
			)
			access.schemaExtension(
				'schema-extension',
				schemaExtension,
				(context) => {
					expectTypeOf(context.extension.config.mode).toEqualTypeOf<'strict'>()

					return { operation: { delete: false } }
				},
				{ master: 'enforce' },
			)
			access.fieldExtension(
				'field-extension',
				fieldExtension,
				(context) => {
					expectTypeOf(context.extension.config.redact).toEqualTypeOf<true>()

					return { read: false }
				},
				{ master: 'bypass' },
			)
			access.fieldKind(
				'field-kind',
				urlTarget,
				({ field }) => {
					expectTypeOf(field).toEqualTypeOf<typeof schema.fields.endpoint>()

					return {
						update: ({ originalValue, value }) => {
							expectTypeOf(originalValue).toEqualTypeOf<URL | null>()
							expectTypeOf(value).toEqualTypeOf<URL | null>()

							return true
						},
					}
				},
				{ master: 'enforce' },
			)
		},
	})
})

test('rejects invalid paths, scopes, kinds, and implicit master behavior', () => {
	definePlugin({
		name: 'fixture.access',
		setup: ({ access }) => {
			// @ts-expect-error -- Exact field targets require a non-empty path.
			access.field('empty', schema, [], { read: true }, { master: 'enforce' })
			access.field(
				'missing',
				schema,
				// @ts-expect-error -- Undeclared fields are absent from the exact path union.
				['missing'],
				{ read: true },
				{ master: 'enforce' },
			)
			access.schemaExtension(
				'wrong',
				// @ts-expect-error -- Schema-extension targets reject field extensions.
				fieldExtension,
				() => ({ operation: { read: true } }),
				{ master: 'enforce' },
			)
			// @ts-expect-error -- Every contribution declares audited-master behavior.
			access.global('implicit-master', { operation: { read: true } })
		},
	})

	// @ts-expect-error -- Kind selectors stay correlated with their custom field.
	defineFieldKindAccessTarget<typeof schema.fields.endpoint>('fixture.other')
})
