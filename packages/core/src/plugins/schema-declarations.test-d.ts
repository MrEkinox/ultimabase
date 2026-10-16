import { expectTypeOf, test } from 'vitest'

import { stringField } from '../index.js'
import {
	addSchemaField,
	addSchemaIndex,
	defineCapability,
	plugin as createPlugin,
	contributeDeclarations,
	defineSchemaOption,
	requireCapability,
	type PluginSchemaDeclarationRegistrar,
	type PluginSchemaOptionSource,
	type SchemaOptionAbsenceSelector,
	type SchemaOptionDefinition,
	type SchemaSelection,
} from '../plugin.js'
import { UltimaBase } from '../runtime/application/ultima-base.js'

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
})

test('rejects the Typegen descriptor removed with Typegen (ADR-0297)', () => {
	defineSchemaOption({
		normalize: (value) => String(value),
		protocolVersion: 1,
	})

	defineSchemaOption({
		normalize: (value) => String(value),
		protocolVersion: 1,
		// @ts-expect-error -- Option definitions no longer name generated types.
		typegen: false,
	})
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
	})
})

test('types schema declarations from exact active privileges', () => {
	createPlugin({
		core: '^0.0.0',
		id: 'fixture.schema-contracts',
		permissions: { 'schema:declare': 'Exercises typed additions.' },
		version: '1.0.0',
		contributions: [
			contributeDeclarations({
				schema: ({ schemas }) => {
					expectTypeOf(
						schemas,
					).toEqualTypeOf<PluginSchemaDeclarationRegistrar>()

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
					expectTypeOf(selected).toExtend<SchemaSelection>()
					const present = schemas.select({ option: { name: 'workflow' } })
					expectTypeOf(present).toExtend<SchemaSelection>()
					const absenceSelector: SchemaOptionAbsenceSelector = {
						name: 'workflow',
						present: false,
					}
					const absent = schemas.select({ option: absenceSelector })
					expectTypeOf(absent).toExtend<SchemaSelection>()
					schemas.select({
						option: {
							name: 'workflow',
							// @ts-expect-error -- Absence is the only supported present flag.
							present: true,
						},
					})
					schemas.select({
						option: {
							equals: false,
							name: 'workflow',
							// @ts-expect-error -- Absence cannot be combined with equality.
							present: false,
						},
					})
					schemas.select({
						option: {
							name: 'workflow',
							path: ['enabled'],
							// @ts-expect-error -- Absence cannot be combined with a path.
							present: false,
						},
					})
					schemas.select({
						// @ts-expect-error -- Paths belong only to equality selectors.
						option: {
							name: 'workflow',
							path: ['enabled'],
						},
					})
					schemas.select({
						option: {
							// @ts-expect-error -- Equality selector values must be portable JSON.
							equals: () => true,
							name: 'workflow',
						},
					})

					schemas.patch({
						operations: [
							addSchemaField({
								contributionId: 'state',
								field: stringField(),
								mutationInput: 'forbidden',
								name: 'state',
							}),
							addSchemaIndex({
								contributionId: 'state-index',
								fields: ['state', 'createdAt'],
							}),
						],
						targets: selected,
					})

					return undefined
				},
			}),
		],
	})
})

test('requires nominal additive patch operations', () => {
	const Post = UltimaBase.Schema.define({
		className: 'TypedSchemaAddition',
		fields: (fieldBuilder) => ({ title: fieldBuilder.string() }),
	})
	createPlugin({
		core: '^0.0.0',
		id: 'fixture.typed-schema-addition',
		permissions: { 'schema:declare': 'Adds one stable schema.' },
		version: '1.0.0',
		contributions: [
			contributeDeclarations({
				schema: ({ schemas }) => {
					schemas.add({ contributionId: 'post', schema: Post })
					schemas.patch({
						// @ts-expect-error -- Arbitrary callback patches are not a public escape hatch.
						operations: [() => Post],
						targets: schemas.select({}),
					})

					return undefined
				},
			}),
		],
	})
})

test('types exact application schema claims', () => {
	const User = UltimaBase.Schema.define({
		className: 'TypedClaimedUser',
		fields: () => ({}),
	})
	createPlugin({
		core: '^0.0.0',
		id: 'fixture.typed-schema-claim',
		permissions: { 'schema:declare': 'Claims one selected User schema.' },
		version: '1.0.0',
		contributions: [
			contributeDeclarations({
				schema: ({ schemas }) => {
					schemas.claim({ contributionId: 'user', schema: User })
					// @ts-expect-error -- Claims accept only genuine schema definitions.
					schemas.claim({ contributionId: 'invalid', schema: {} })

					return undefined
				},
			}),
		],
	})
})

test('does not claim issue 1408 direct option augmentation', () => {
	UltimaBase.Schema.define({
		className: 'UngeneratedOptionSchema',
		fields: (field) => ({
			title: field.string({
				// @ts-expect-error -- No installed plugin contributes this direct option.
				search: { weight: 10 },
			}),
		}),
	})
	UltimaBase.Schema.define({
		className: 'UngeneratedWorkflowSchema',
		fields: (field) => ({ title: field.string() }),
	}).with((plugins) =>
		plugins
			// @ts-expect-error -- No installed plugin contributes this schema rule.
			.workflow({ enabled: true }),
	)
})

test('accepts only inert Core receipts from static declarations', () => {
	// @ts-expect-error -- Arbitrary return values are not declaration receipts.
	contributeDeclarations({
		schema: () => ({ registered: true }),
	})
})

test('projects no schema-option template: rules are typed by `.with` (ADR-0297)', () => {
	type Storage = SchemaOptionDefinition<Readonly<{ table: string }>>

	expectTypeOf<
		PluginSchemaOptionSource<{
			readonly contributionId: 'rule-only'
			readonly schema: Readonly<{ storage: Storage }>
		}>
	>().toBeNever()
})
