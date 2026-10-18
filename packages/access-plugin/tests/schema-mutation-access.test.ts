import { onTestFinished, describe, expect, it, vi } from 'vitest'
import {
	MasterAuthority,
	UltimaBase,
	databaseAdapterCapability,
	stringField,
	type DatabaseAdapter,
	type ScalarFieldTypeState,
	type SchemaDefinition,
	type StringField,
} from '@ultimabase/core'
import {
	addSchemaField,
	contributeDeclarations,
	contributeSchemaMutation,
	defineOperationValue,
	plugin,
	defineSchemaMutation,
	provideCapability,
	type PluginContribution,
	type PluginDefinition,
	type PluginSchemaFieldsSource,
	type PluginSchemaStaticsSource,
	type PluginSourceState,
	type PluginSchemaMutationDefinition,
	type SchemaCommands,
	type SchemaFieldsHKT,
	type SchemaStaticsHKT,
} from '@ultimabase/core/plugin'
import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

import {
	accessPlugin,
	provideAccessContributions,
	schemaAccess,
} from '../src/index.js'
import {
	SchemaMutationAdapter,
	schemaMutationAccessId,
} from './schema-mutation-access.test-support.js'

type ArchiveInput = Readonly<{ readonly reason: string }>

const archive: PluginSchemaMutationDefinition<
	'fixture.access.archive',
	'1.0.0',
	ArchiveInput,
	readonly [],
	'request',
	'update',
	'after',
	Readonly<Record<never, never>>
> = defineSchemaMutation({
	authority: 'request',
	effect: 'update',
	input: defineOperationValue((value, path) => {
		if (!isPlainRecord(value) || typeof value.reason !== 'string') {
			throw new TypeError(`${path}.reason must be a string`)
		}
		return immutableRecord({ reason: value.reason })
	}),
	name: 'fixture.access.archive',
	returning: 'after',
	version: '1.0.0',
})

const purge: PluginSchemaMutationDefinition<
	'fixture.access.purge',
	'1.0.0',
	undefined,
	readonly [],
	'master',
	'delete',
	'before',
	Readonly<Record<never, never>>
> = defineSchemaMutation({
	authority: 'master',
	effect: 'delete',
	input: defineOperationValue((value, path): undefined => {
		if (value !== undefined) throw new TypeError(`${path} must be undefined`)
		return undefined
	}),
	name: 'fixture.access.purge',
	returning: 'before',
	version: '1.0.0',
})

const operationInputs: unknown[] = []
const filterInputs: unknown[] = []
const itemInputs: unknown[] = []

// The fields and statics slots (ADR-0316) type the patched field and the
// archive command of every schema the fixture application declares.
interface ArchiveFields extends SchemaFieldsHKT {
	readonly fields: Readonly<{
		workflowState: StringField<ScalarFieldTypeState<false, false, false, false>>
	}>
}

interface ArchiveStatics extends SchemaStaticsHKT {
	readonly statics: SchemaCommands<
		this['schema'],
		{ readonly archiveOne: typeof archive }
	>
}

type ArchiveSource =
	| PluginSchemaFieldsSource<ArchiveFields>
	| PluginSchemaStaticsSource<ArchiveStatics>

const mutationSourcePlugin = plugin<
	'fixture.access-schema-mutation-source',
	undefined,
	'1.0.0',
	'^0.0.0',
	undefined,
	undefined,
	undefined,
	undefined,
	undefined,
	readonly PluginContribution[],
	ArchiveSource
>({
	contributions: [
		contributeSchemaMutation({
			mutation: archive,
			resolve: () => ({ data: { workflowState: 'archived' } }),
		}),
		contributeDeclarations({
			schema: ({ schemas }) => [
				schemas.patch({
					operations: [
						addSchemaField({
							contributionId: 'access-document-workflow-state',
							field: stringField(),
							name: 'workflowState',
						}),
					],
					targets: schemas.select({
						className: 'AccessSchemaMutationDocument',
					}),
				}),
				schemas.patch({
					operations: [
						addSchemaField({
							contributionId: 'provider-document-workflow-state',
							field: stringField(),
							name: 'workflowState',
						}),
					],
					targets: schemas.select({
						className: 'AccessSchemaMutationProviderDocument',
					}),
				}),
			],
			models: ({ models }) => [
				models.extend(
					{ className: 'AccessSchemaMutationDocument' },
					{
						contributionId: 'access-document-archive-surface',
						schemaMutations: {
							archiveOne: { mutation: archive, surfaces: ['schema'] },
						},
					},
				),
				models.extend(
					{ className: 'AccessSchemaMutationProviderDocument' },
					{
						contributionId: 'provider-document-archive-surface',
						schemaMutations: {
							archiveOne: { mutation: archive, surfaces: ['schema'] },
						},
					},
				),
			],
		}),
	],
	core: '^0.0.0',
	id: 'fixture.access-schema-mutation-source',
	permissions: {
		'model:extend': 'Adds source-only archive surfaces for the type fixture.',
		'operation:declare': 'Declares the archive source contract.',
		'persistence:rewrite': 'Defines the archive source mutation.',
		'schema:declare': 'Adds source-only workflow state fields.',
	},
	version: '1.0.0',
})
const AccessMutationApplication =
	UltimaBase.use(mutationSourcePlugin).use(accessPlugin())

const AccessDocument = AccessMutationApplication.Schema.define({
	className: 'AccessSchemaMutationDocument',
	fields: (field) => ({
		secret: field.string({
			access: {
				read: { orderBy: true, output: () => false, where: true },
			},
		}),
		title: field.string(),
	}),
}).with({
	access: {
		archive: {
			// One rule before loading (ADR-0317): no row, or a row filter.
			where: (input) => {
				operationInputs.push(input)
				if (input.input.reason === 'deny') return false
				filterInputs.push(input)
				return input.where.eq('title', 'visible')
			},
			item: (input) => {
				itemInputs.push(input)
				return input.item.workflowState === 'archived'
			},
		},
		delete: false,
		// Mutation results obey the read rules (ADR-0306): the fixture reads back.
		read: true,
		update: false,
	},
})

const GranularDeniedDocument = UltimaBase.Schema.define({
	className: 'AccessSchemaMutationGranularDeniedDocument',
	fields: (field) => ({ secret: field.string(), title: field.string() }),
})

const GranularAllowedDocument = UltimaBase.Schema.define({
	className: 'AccessSchemaMutationGranularAllowedDocument',
	fields: (field) => ({ secret: field.string(), title: field.string() }),
})

const BooleanDefaultDocument = UltimaBase.Schema.define({
	className: 'AccessSchemaMutationBooleanDefaultDocument',
	fields: (field) => ({ secret: field.string(), title: field.string() }),
})

const ProviderDocument = AccessMutationApplication.Schema.define({
	className: 'AccessSchemaMutationProviderDocument',
	fields: (field) => ({ secret: field.string(), title: field.string() }),
}).with({
	access: {
		archive: ({ input }) => input.reason !== 'developer-deny',
	},
})

const MasterDocument = UltimaBase.Schema.define({
	className: 'AccessSchemaMutationMasterDocument',
	fields: (field) => ({ secret: field.string(), title: field.string() }),
})

const NoAccessDocument = UltimaBase.Schema.define({
	className: 'AccessSchemaMutationNoEngineDocument',
	fields: (field) => ({ secret: field.string(), title: field.string() }),
})

let pluginIndex = 0
const createMutationOwner = (schema: SchemaDefinition) => {
	pluginIndex += 1
	const handler = vi.fn(() => ({ data: { workflowState: 'archived' } }))
	return {
		handler,
		plugin: plugin({
			contributions: [
				contributeSchemaMutation({ mutation: archive, resolve: handler }),
				contributeDeclarations({
					schema: ({ schemas }) => {
						schemas.patch({
							operations: [
								addSchemaField({
									contributionId: 'workflow-state',
									field: stringField(),
									name: 'workflowState',
								}),
							],
							targets: schemas.select({ className: schema.className }),
						})
						return undefined
					},
					models: ({ models }) => {
						models.extend(
							{ className: schema.className },
							{
								contributionId: 'archive-surface',
								schemaMutations: {
									archiveOne: { mutation: archive, surfaces: ['schema'] },
								},
							},
						)
						return undefined
					},
				}),
			],
			core: '^0.0.0',
			id: `fixture.access-schema-mutation-${String(pluginIndex)}`,
			permissions: {
				'model:extend': 'Adds archive.',
				'operation:declare': 'Declares archive.',
				'persistence:rewrite': 'Persists archive.',
				'schema:declare': 'Adds workflow state.',
			},
			version: '1.0.0',
		}),
	}
}

const createMasterMutationOwner = (schema: SchemaDefinition) => {
	pluginIndex += 1
	return plugin({
		contributions: [
			contributeSchemaMutation({
				mutation: purge,
				resolve: () => undefined,
			}),
			contributeDeclarations({
				models: ({ models }) => {
					models.extend(
						{ className: schema.className },
						{
							contributionId: 'purge-surface',
							schemaMutations: {
								purgeOne: { mutation: purge, surfaces: ['schema'] },
							},
						},
					)
					return undefined
				},
			}),
		],
		core: '^0.0.0',
		id: `fixture.access-schema-master-mutation-${String(pluginIndex)}`,
		permissions: {
			'model:extend': 'Adds purge.',
			'operation:declare': 'Declares purge.',
			'persistence:rewrite': 'Persists purge.',
		},
		version: '1.0.0',
	})
}

const databasePlugin = (adapter: DatabaseAdapter) =>
	plugin({
		contributions: [
			provideCapability(databaseAdapterCapability, {
				contributionId: 'database-adapter',
				create: () => ({ value: adapter }),
			}),
		],
		core: '^0.0.0',
		id: `fixture.access-schema-mutation-database-${String(pluginIndex)}`,
		version: '1.0.0',
	})

const executeArchive = (
	ultimabase: UltimaBase<
		readonly SchemaDefinition[],
		readonly PluginDefinition[],
		PluginSourceState
	>,
	schema: SchemaDefinition,
	reason: string,
) => {
	const method = Reflect.get(ultimabase.schema(schema), 'archiveOne') as (
		input: unknown,
		options?: unknown,
	) => Promise<unknown>
	return method(
		{
			id: schemaMutationAccessId,
			input: { reason },
			select: { secret: true, title: true, workflowState: true },
		},
		undefined,
	)
}

describe('schema mutation Access', () => {
	it('rejects a forbidden selection before preparing a custom mutation', async () => {
		const Restricted = UltimaBase.use(
			accessPlugin({ allowWithoutRule: { all: true } }),
		).Schema.define({
			className: 'AccessSchemaMutationRestrictedSelection',
			fields: (field) => ({
				secret: field.string({ access: { read: false } }),
				title: field.string(),
			}),
		})
		const adapter = new SchemaMutationAdapter()
		const owner = createMutationOwner(Restricted)
		const ultimabase = new (UltimaBase.use(
			accessPlugin({ allowWithoutRule: { all: true } }),
			owner.plugin,
			databasePlugin(adapter),
		))({
			logger: false,
			schemas: [Restricted],
		})
		onTestFinished(() => ultimabase.dispose())
		await ultimabase.start()

		// An allowed command cannot turn an explicit forbidden field into a projection.
		await expect(
			executeArchive(ultimabase, Restricted, 'allow'),
		).rejects.toMatchObject({
			code: 'PERMISSION_DENIED',
		})
		expect(owner.handler).not.toHaveBeenCalled()
		expect(adapter.transactions).toHaveLength(1)
		expect(adapter.transactions[0]?.preparations).toHaveLength(0)
	})

	it('keeps the custom operation rule, item, and output rules independent', async () => {
		operationInputs.length = 0
		filterInputs.length = 0
		itemInputs.length = 0
		const adapter = new SchemaMutationAdapter()
		const owner = createMutationOwner(AccessDocument)
		const ultimabase = new (UltimaBase.use(
			accessPlugin(),
			owner.plugin,
			databasePlugin(adapter),
		))({
			logger: false,
			schemas: [AccessDocument],
		})
		onTestFinished(() => ultimabase.dispose())

		try {
			await ultimabase.start()
			await expect(
				executeArchive(ultimabase, AccessDocument, 'deny'),
			).rejects.toMatchObject({
				code: 'PERMISSION_DENIED',
			})
			const result = await executeArchive(ultimabase, AccessDocument, 'allow')
			expect(result).toMatchObject({
				title: 'visible',
				workflowState: 'archived',
			})
			expect(result).not.toHaveProperty('secret')
			expect(adapter.transactions).toHaveLength(2)
			expect(adapter.transactions[0]?.preparations).toHaveLength(0)
			expect(adapter.transactions[1]?.preparations[0]?.rowFilter).toBeDefined()
			expect(operationInputs).toHaveLength(2)
			expect(filterInputs).toHaveLength(1)
			expect(itemInputs).toHaveLength(1)
			const operationInput = operationInputs[1]
			expect(
				isPlainRecord(operationInput) && isPlainRecord(operationInput.mutation)
					? Object.keys(operationInput.mutation).sort()
					: [],
			).toStrictEqual(['authority', 'effect', 'kind', 'name', 'version'])
			expect(itemInputs[0]).toMatchObject({
				input: { reason: 'allow' },
				item: { workflowState: 'archived' },
				mutation: { name: archive.name, version: archive.version },
				originalItem: { workflowState: 'published' },
			})
			await expect(
				AccessDocument.updateOne({
					data: { title: 'denied' },
					where: { id: { eq: schemaMutationAccessId } },
				}),
			).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
		} finally {
			await ultimabase.dispose()
		}
	})

	it('uses fail-closed openings and isolates them between applications', async () => {
		const deniedAdapter = new SchemaMutationAdapter()
		const allowedAdapter = new SchemaMutationAdapter()
		const booleanAdapter = new SchemaMutationAdapter()
		const deniedOwner = createMutationOwner(GranularDeniedDocument)
		const allowedOwner = createMutationOwner(GranularAllowedDocument)
		const booleanOwner = createMutationOwner(BooleanDefaultDocument)
		const denied = new (UltimaBase.use(
			accessPlugin({ allowWithoutRule: { update: true } }),
			deniedOwner.plugin,
			databasePlugin(deniedAdapter),
		))({
			logger: false,
			schemas: [GranularDeniedDocument],
		})
		onTestFinished(() => denied.dispose())
		const allowed = new (UltimaBase.use(
			// Mutation results obey the read rules (ADR-0306).
			accessPlugin({ allowWithoutRule: { read: true, archive: true } }),
			allowedOwner.plugin,
			databasePlugin(allowedAdapter),
		))({
			logger: false,
			schemas: [GranularAllowedDocument],
		})
		onTestFinished(() => allowed.dispose())
		const booleanAllowed = new (UltimaBase.use(
			accessPlugin({ allowWithoutRule: { all: true } }),
			booleanOwner.plugin,
			databasePlugin(booleanAdapter),
		))({
			logger: false,
			schemas: [BooleanDefaultDocument],
		})
		onTestFinished(() => booleanAllowed.dispose())

		try {
			await denied.start()
			await expect(
				executeArchive(denied, GranularDeniedDocument, 'default-deny'),
			).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
			await denied.dispose()
			await allowed.start()
			await expect(
				executeArchive(allowed, GranularAllowedDocument, 'default-allow'),
			).resolves.toMatchObject({ workflowState: 'archived' })
			await allowed.dispose()
			await booleanAllowed.start()
			await expect(
				executeArchive(booleanAllowed, BooleanDefaultDocument, 'boolean-allow'),
			).resolves.toMatchObject({ workflowState: 'archived' })
			expect(deniedAdapter.transactions[0]?.preparations).toHaveLength(0)
			expect(allowedAdapter.transactions).toHaveLength(1)
			expect(booleanAdapter.transactions).toHaveLength(1)
		} finally {
			await Promise.all([
				denied.dispose(),
				allowed.dispose(),
				booleanAllowed.dispose(),
			])
		}
	})

	it('lets a compatible provider narrow but never grant a custom mutation', async () => {
		const adapter = new SchemaMutationAdapter()
		const owner = createMutationOwner(ProviderDocument)
		const providerRule = vi.fn(
			({ input }: { readonly input: Readonly<{ readonly reason: string }> }) =>
				input.reason !== 'provider-deny',
		)
		const provider = plugin({
			contributions: [
				provideAccessContributions('archive-policy', () =>
					schemaAccess(ProviderDocument, {
						archive: providerRule,
					}),
				),
			],
			core: '^0.0.0',
			peers: [{ pluginId: '@ultimabase/access-plugin', version: '^0.0.0' }],
			id: 'fixture.access-schema-mutation-provider',
			permissions: {
				'runtime:constrain': 'Narrows archive policy.',
			},
			version: '1.0.0',
		})
		const ultimabase = new (UltimaBase.use(
			provider,
			// Mutation results obey the read rules (ADR-0306).
			accessPlugin({ allowWithoutRule: { read: true, archive: true } }),
			owner.plugin,
			databasePlugin(adapter),
		))({
			logger: false,
			schemas: [ProviderDocument],
		})
		onTestFinished(() => ultimabase.dispose())

		try {
			await ultimabase.start()
			await expect(
				executeArchive(ultimabase, ProviderDocument, 'provider-deny'),
			).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
			await expect(
				executeArchive(ultimabase, ProviderDocument, 'developer-deny'),
			).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
			await expect(
				executeArchive(ultimabase, ProviderDocument, 'allowed'),
			).resolves.toMatchObject({ workflowState: 'archived' })
			expect(providerRule).toHaveBeenCalledTimes(2)
		} finally {
			await ultimabase.dispose()
		}
	})

	it('bypasses the complete custom Access policy only for audited Master', async () => {
		const adapter = new SchemaMutationAdapter()
		const owner = createMutationOwner(MasterDocument)
		const audit = vi.fn()
		const ultimabase = new (UltimaBase.use(
			accessPlugin(),
			owner.plugin,
			databasePlugin(adapter),
		))({
			masterAuthority: new MasterAuthority({
				keys: [{ id: 'schema-mutation-access-master', value: 'unused' }],
				onUse: audit,
			}),
			logger: false,
			schemas: [MasterDocument],
		})
		onTestFinished(() => ultimabase.dispose())

		try {
			await ultimabase.start()
			await expect(
				executeArchive(ultimabase, MasterDocument, 'anonymous'),
			).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
			const method = Reflect.get(
				ultimabase.schema(MasterDocument),
				'archiveOne',
			) as (input: unknown, options: unknown) => Promise<unknown>
			await expect(
				method(
					{
						id: schemaMutationAccessId,
						input: { reason: 'master' },
						select: { secret: true, title: true, workflowState: true },
					},
					{ useMasterKey: true },
				),
			).resolves.toMatchObject({ workflowState: 'archived' })
			expect(audit).toHaveBeenCalledOnce()
			expect(owner.handler).toHaveBeenCalledOnce()
		} finally {
			await ultimabase.dispose()
		}
	})

	it('executes structurally valid mutations when the Access engine is omitted', async () => {
		const adapter = new SchemaMutationAdapter()
		const owner = createMutationOwner(NoAccessDocument)
		const ultimabase = new (UltimaBase.use(
			owner.plugin,
			databasePlugin(adapter),
		))({ logger: false, schemas: [NoAccessDocument] })
		onTestFinished(() => ultimabase.dispose())

		try {
			await ultimabase.start()
			await expect(
				executeArchive(ultimabase, NoAccessDocument, 'no-engine'),
			).resolves.toMatchObject({ workflowState: 'archived' })
		} finally {
			await ultimabase.dispose()
		}
	})

	it('rejects stale and Master-only custom Access branches before setup effects', async () => {
		const AccessApplication = UltimaBase.use(accessPlugin())
		const StaleDocument = AccessApplication.Schema.define({
			className: 'AccessSchemaMutationStaleDocument',
			fields: (field) => ({ secret: field.string(), title: field.string() }),
		}).with({ access: { stale: true } as never })
		const adapter = new SchemaMutationAdapter()
		const owner = createMutationOwner(StaleDocument)
		const ultimabase = new (UltimaBase.use(
			accessPlugin(),
			owner.plugin,
			databasePlugin(adapter),
		))({
			logger: false,
			schemas: [StaleDocument],
		})
		onTestFinished(() => ultimabase.dispose())

		await expect(ultimabase.start()).rejects.toThrow(
			'Unknown Access rule: access.stale',
		)
		expect(adapter.transactions).toHaveLength(0)

		const MasterOnlyDocument = AccessApplication.Schema.define({
			className: 'AccessSchemaMutationMasterOnlyDocument',
			fields: (field) => ({ title: field.string() }),
		}).with({ access: { purgeOne: true } as never })
		const masterAdapter = new SchemaMutationAdapter()
		const masterOnly = new (UltimaBase.use(
			accessPlugin(),
			createMasterMutationOwner(MasterOnlyDocument),
			databasePlugin(masterAdapter),
		))({
			logger: false,
			schemas: [MasterOnlyDocument],
		})
		onTestFinished(() => masterOnly.dispose())

		await expect(masterOnly.start()).rejects.toThrow(
			'Unknown request schema mutation Access branch: access.purgeOne',
		)
		expect(masterAdapter.transactions).toHaveLength(0)
	})
})
