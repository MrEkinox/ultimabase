import { expectTypeOf, test } from 'vitest'

import {
	Schema,
	addSchemaField,
	addSchemaIndex,
	defineCapability,
	definePlugin,
	defineSchemaOption,
	removeSchemaField,
	renameSchemaField,
	replaceSchemaField,
	requireCapability,
	stringField,
	type PluginSchemaDeclarationRegistrar,
	type SchemaSelection,
} from '../index.js'

const workflowOption = defineSchemaOption({
	normalize: (value: unknown) => {
		if (
			typeof value !== 'object' ||
			value === null ||
			!('enabled' in value) ||
			typeof value.enabled !== 'boolean'
		) {
			throw new TypeError('workflow.enabled must be a boolean')
		}

		return { enabled: value.enabled } as const
	},
	protocolVersion: 1,
	typegen: {
		module: '@fixture/workflow-plugin',
		type: 'WorkflowSchemaOption',
	},
})

test('types Runtime option compilation from the exact capability requirement', () => {
	interface Registry {
		register(className: string): void
	}
	const token = defineCapability<Registry>()({
		capabilityId: 'fixture.typed-runtime-option',
		cardinality: 'single',
		compose: ([provider]) => provider,
		lifetime: 'application',
		version: '1.0.0',
	})
	const requirement = requireCapability(token, '^1.0.0')

	defineSchemaOption({
		normalize: (value) => String(value),
		protocolVersion: 1,
		runtime: {
			compile: (context) => {
				expectTypeOf(context.capability).toEqualTypeOf<Registry>()
				expectTypeOf(context.value).toEqualTypeOf<string>()
				expectTypeOf(context.scope).toEqualTypeOf<'field' | 'schema'>()
				context.capability.register(context.className)
				return undefined
			},
			requirement,
		},
		typegen: {
			module: '@fixture/typed-runtime-option-plugin',
			type: 'TypedRuntimeOption',
		},
	})

	const setupRequirement = requireCapability(token, '^1.0.0', {
		phase: 'setup',
	})
	defineSchemaOption({
		normalize: (value) => String(value),
		protocolVersion: 1,
		runtime: {
			compile: () => undefined,
			// @ts-expect-error -- Runtime option compilation happens before plugin setup.
			requirement: setupRequirement,
		},
		typegen: {
			module: '@fixture/typed-runtime-option-plugin',
			type: 'InvalidSetupOption',
		},
	})
})

test('types schema declarations from exact active privileges', () => {
	definePlugin({
		core: '^0.0.0',
		pluginId: 'fixture.schema-contracts',
		privileges: [
			{
				name: 'schema:declare',
				reason: 'Exercises typed additions.',
			},
			{
				name: 'schema:transform',
				reason: 'Exercises typed transforms.',
			},
		] as const,
		version: '1.0.0',
		declare: ({ schemas }) => {
			expectTypeOf(schemas).toEqualTypeOf<PluginSchemaDeclarationRegistrar>()

			schemas.defineOptions({
				contributionId: 'workflow-options',
				schema: { workflow: workflowOption },
			})
			const selected = schemas.select({
				field: { kind: 'string', name: 'title' },
				option: {
					equals: true,
					name: 'workflow',
					path: ['enabled'],
				},
				owner: { kind: 'application' },
			})
			expectTypeOf(selected).toEqualTypeOf<SchemaSelection>()

			schemas.patch({
				operations: [
					addSchemaField({
						contributionId: 'state',
						field: stringField(),
						name: 'state',
					}),
					addSchemaIndex({
						contributionId: 'state-index',
						fields: ['state', 'createdAt'],
					}),
				],
				targets: selected,
			})
		},
	})
})

test('requires exact transform targets and nominal patch operations', () => {
	const field = stringField()
	const target = {
		contributionId: 'field:Post.title',
		expected: field,
		owner: { kind: 'application' as const },
	}

	expectTypeOf(
		replaceSchemaField({
			contributionId: 'replace-title',
			field: stringField({ validation: { required: true } }),
			name: 'title',
			target,
		}),
	).toHaveProperty('kind')
	expectTypeOf(
		renameSchemaField({
			contributionId: 'rename-title',
			from: 'title',
			target,
			to: 'headline',
		}),
	).toHaveProperty('kind')
	expectTypeOf(
		removeSchemaField({
			contributionId: 'remove-title',
			name: 'title',
			target,
		}),
	).toHaveProperty('kind')

	const Post = Schema.define({
		className: 'TypedSchemaAddition',
		fields: (fieldBuilder) => ({ title: fieldBuilder.string() }),
	})
	definePlugin({
		core: '^0.0.0',
		pluginId: 'fixture.typed-schema-addition',
		privileges: [
			{
				name: 'schema:declare',
				reason: 'Adds one stable schema.',
			},
		] as const,
		version: '1.0.0',
		declare: ({ schemas }) => {
			schemas.add({ contributionId: 'post', schema: Post })
			// @ts-expect-error -- Arbitrary callback patches are not a public escape hatch.
			schemas.patch({ operations: [() => Post], targets: schemas.select({}) })
		},
	})
})

test('does not claim issue 1408 direct option augmentation', () => {
	Schema.define({
		className: 'UngeneratedOptionSchema',
		fields: (field) => ({
			title: field.string({
				// @ts-expect-error -- Typegen owns installed direct option autocomplete.
				search: { weight: 10 },
			}),
		}),
		// @ts-expect-error -- Typegen owns installed direct schema option autocomplete.
		workflow: { enabled: true },
	})
})
