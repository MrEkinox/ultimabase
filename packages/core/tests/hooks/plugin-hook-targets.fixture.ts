import {
	defineFieldExtension,
	defineFieldKindHookTarget,
	definePlugin,
	definePluginField,
	defineSchemaExtension,
	objectField,
	Schema,
	stringField,
} from '../../src/index.js'

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
const TargetSchema = new Schema({
	className: 'PluginHookTargetFixture',
	fields: {
		endpoint: definePluginField('fixture.url', {}, urlNormalizers),
		profile: objectField({
			fields: {
				displayName: stringField({ validation: { nullable: true } }),
			},
		}),
		tags: stringField({
			list: true,
			validation: { nullable: true },
			extensions: [fieldExtension],
		}),
		title: stringField({ validation: { required: true } }),
	},
	extensions: [schemaExtension],
})
const urlKindTarget =
	/* hover:kind-target */ defineFieldKindHookTarget<
		typeof TargetSchema.fields.endpoint
	>('fixture.url')

definePlugin({
	name: 'fixture.setup-completion',
	setup: (context) => void context./* completion:setup-context */ hooks,
})

export const hookTargetFixturePlugin = definePlugin({
	name: 'fixture.hooks',
	setup: ({ hooks }) => {
		const /* hover:hook-registry */ registry = hooks

		void registry
		hooks./* completion:hook-target-methods */ global('global', {
			beforeOperation: ({ operation }) => operation,
		})
		hooks.schema('schema', TargetSchema, {
			beforeCreate: ({ operation }) => {
				if (operation.kind === 'create-one') {
					const /* hover:schema-title */ title = operation.input.title

					void title
				}

				return operation
			},
		})
		hooks.field('listed', TargetSchema, ['tags'], {
			resolveInput: ({ value }) => {
				const /* hover:listed-value */ listedValue = value

				return listedValue
			},
		})
		hooks.field('object', TargetSchema, ['profile'], {
			beforeSave: ({ value }) => {
				const /* hover:object-value */ objectValue = value

				void objectValue
			},
		})
		hooks.field('nested', TargetSchema, ['profile', 'displayName'], {
			resolveOutput: ({ value }) => value,
		})
		hooks.field('custom', TargetSchema, ['endpoint'], {
			resolveInput: ({ value }) => {
				const /* hover:custom-value */ customValue = value

				return customValue
			},
		})
		hooks.field('path-completion', TargetSchema, ['title'], {
			onError: ({ error }) => void error,
		})
		hooks.schemaExtension('schema-extension', schemaExtension, (context) => {
			const /* hover:schema-extension-config */ mode =
					context.extension.config.mode

			void mode
			return { beforeFind: ({ query }) => query }
		})
		hooks.fieldExtension('field-extension', fieldExtension, (context) => {
			const /* hover:field-extension-config */ redact =
					context.extension.config.redact

			void redact
			return { onError: ({ error }) => void error }
		})
		hooks.fieldKind('field-kind', urlKindTarget, () => ({
			resolveInput: ({ value }) => {
				const /* hover:kind-value */ kindValue = value

				return kindValue
			},
		}))

		hooks.field(
			'root-completion',
			TargetSchema,
			[
				// @ts-expect-error -- The empty literal exists only to inspect root completions.
				/* completion:root-field-path */ '',
			],
			{},
		)
		hooks.field(
			'nested-completion',
			TargetSchema,
			[
				'profile',
				// @ts-expect-error -- The empty literal exists only to inspect nested completions.
				/* completion:nested-field-path */ '',
			],
			{},
		)
		// @ts-expect-error -- Exact field targets require a non-empty path.
		hooks.field('invalid-empty', TargetSchema, [], {})
		// @ts-expect-error -- Exact schemas reject undeclared fields.
		hooks.field('invalid-missing', TargetSchema, ['missing'], {})
		// @ts-expect-error -- Scalar fields cannot be traversed as objects.
		hooks.field('invalid-scalar', TargetSchema, ['title', 'child'], {})
	},
})
