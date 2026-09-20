import { applicationFixture } from '../../tests/application-fixture.js'
import { isPlainRecord } from '@ultimabase/shared'
import { describe, expect, it } from 'vitest'
import {
	FrameworkApplication,
	Schema,
	addSchemaField,
	addSchemaIndex,
	compileValidationPlans,
	createApplication,
	definePlugin,
	defineSchemaOption,
	pointerField,
	readFieldTypegenState,
	setSchemaFieldOption,
	setSchemaOption,
	stringField,
	type SchemaOptions,
} from '../index.js'
import { snapshotJsonValue } from '../schema/fields/builtins/json.js'

import {
	optionPlugin,
	requireField,
} from '../../tests/plugins/schema-declarations.fixtures.js'

describe('plugin schema declaration registry', () => {
	it('lets a plugin contribute selectable stored fields outside mutation inputs', async () => {
		const Document = Schema.define({
			className: 'PluginManagedFieldDocument',
			fields: (field) => ({ title: field.string() }),
		})
		const plugin = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.plugin-managed-field',
			privileges: [
				{
					name: 'schema:declare',
					reason: 'Adds one plugin-managed stored field.',
				},
			] as const,
			version: '1.0.0',
			declare: ({ schemas }) => {
				schemas.patch({
					operations: [
						addSchemaField({
							contributionId: 'managed-state',
							field: stringField({ default: 'ready', required: true }),
							mutationInput: 'forbidden',
							name: 'managedState',
						}),
					],
					targets: schemas.select({ className: Document.className }),
				})
			},
		})

		await (
			await createApplication({ plugins: [plugin], schemas: [Document] })
		).dispose()

		const managedState = Document.persistedFields.managedState
		if (managedState === undefined) {
			throw new TypeError('Expected the plugin-managed field')
		}
		expect(readFieldTypegenState(managedState)).toEqual({
			create: 'forbidden',
			list: false,
			nullable: false,
			object: 'required',
			update: 'forbidden',
		})
		const plans = compileValidationPlans(Document)
		expect(plans.create.fields.managedState?.presence).toBe('forbidden')
		expect(plans.update.fields.managedState?.presence).toBe('forbidden')
	})

	it('rejects duplicate additions across ordered plugins', async () => {
		const Post = Schema.define({
			className: 'AdditionPrivilegePost',
			fields: (field) => ({ title: field.string() }),
		})
		const contributor = (pluginId: string, dependency?: string) =>
			definePlugin({
				core: '^0.0.0',
				...(dependency === undefined
					? {}
					: {
							dependencies: [{ pluginId: dependency, version: '^1.0.0' }],
						}),
				pluginId,
				privileges: [
					{
						name: 'schema:declare',
						reason: 'Exercises duplicate field rejection.',
					},
				] as const,
				version: '1.0.0',
				declare: ({ schemas }) => {
					schemas.patch({
						operations: [
							addSchemaField({
								contributionId: 'state',
								field: stringField(),
								name: 'state',
							}),
						],
						targets: schemas.select({ className: 'AdditionPrivilegePost' }),
					})
				},
			})

		await expect(
			createApplication({
				plugins: [
					contributor('fixture.first-addition'),
					contributor('fixture.second-addition', 'fixture.first-addition'),
				],
				schemas: [Post],
			}),
		).rejects.toThrow('Duplicate schema field: AdditionPrivilegePost.state')
	})

	it('keeps repeat compilation stable and rejects incompatible schema reuse', async () => {
		let normalizations = 0
		const stableOption = defineSchemaOption({
			normalize: (value, path) => {
				normalizations += 1
				if (!isPlainRecord(value)) {
					throw new TypeError(`${path} must be an object`)
				}
				return snapshotJsonValue(value, path)
			},
			protocolVersion: 1,
			typegen: {
				module: '@fixture/stable-option-plugin',
				type: 'StableOption',
			},
		})
		const plugin = (pluginId: string) =>
			definePlugin({
				core: '^0.0.0',
				pluginId,
				privileges: [
					{
						name: 'schema:declare',
						reason: 'Declares one stable direct option.',
					},
				] as const,
				version: '1.0.0',
				declare: ({ schemas }) => {
					schemas.defineOptions({
						contributionId: 'stable-option',
						schema: { stable: stableOption },
					})
				},
			})
		const owner = plugin('fixture.stable-option-owner')
		const Shared = Schema.define({
			className: 'StableReusePost',
			fields: (field) => ({ title: field.string() }),
			stable: { enabled: true },
		} as SchemaOptions<'StableReusePost'> & {
			readonly stable: Readonly<{ readonly enabled: boolean }>
		})
		const first = applicationFixture(
			new FrameworkApplication({
				pluginPrivileges: { logger: false },
				plugins: [owner],
				schemas: [Shared],
			}),
		)

		expect(first.compileSchemas()).toBe(first)
		expect(first.compileSchemas()).toBe(first)
		expect(normalizations).toBe(1)
		await first.initialize()
		await first.dispose()
		expect(normalizations).toBe(1)

		await (
			await createApplication({
				pluginPrivileges: { logger: false },
				plugins: [owner],
				schemas: [Shared],
			})
		).dispose()
		expect(normalizations).toBe(2)

		await expect(
			createApplication({
				pluginPrivileges: { logger: false },
				plugins: [plugin('fixture.incompatible-option-owner')],
				schemas: [Shared],
			}),
		).rejects.toThrow(
			'Schema StableReusePost compiled differently in another application',
		)
	})

	it('never treats a removed plugin contribution as automatic schema cleanup', async () => {
		const Shared = Schema.define({
			className: 'RemovedContributionPost',
			fields: (field) => ({ title: field.string() }),
		})
		const contributor = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.removed-contribution',
			privileges: [
				{
					name: 'schema:declare',
					reason: 'Adds one persisted logical field.',
				},
			] as const,
			version: '1.0.0',
			declare: ({ schemas }) => {
				schemas.patch({
					operations: [
						addSchemaField({
							contributionId: 'external-reference',
							field: stringField(),
							name: 'externalReference',
						}),
					],
					targets: schemas.select({
						className: 'RemovedContributionPost',
					}),
				})
			},
		})

		await (
			await createApplication({
				pluginPrivileges: { logger: false },
				plugins: [contributor],
				schemas: [Shared],
			})
		).dispose()
		expect(Shared.fields.externalReference?.kind).toBe('string')

		await expect(
			createApplication({
				pluginPrivileges: { logger: false },
				plugins: [],
				schemas: [Shared],
			}),
		).rejects.toThrow(
			'Schema RemovedContributionPost compiled differently in another application',
		)
		expect(Shared.fields.externalReference?.kind).toBe('string')
	})

	it('adds option values and indexes without replacing existing facts', async () => {
		const Post = Schema.define({
			className: 'OptionAndIndexAdditionPost',
			fields: (field) => ({ title: field.string(), summary: field.string() }),
		})
		const contributor = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.option-index-addition',
			version: '1.0.0',
			dependencies: [{ pluginId: 'fixture.schema-options', version: '^1.2.3' }],
			privileges: [
				{
					name: 'schema:declare',
					reason: 'Adds owned option values and indexes.',
				},
			],
			declare: ({ schemas }) => {
				schemas.patch({
					targets: schemas.select({ className: Post.className }),
					operations: [
						setSchemaOption({
							contributionId: 'workflow-value',
							name: 'workflow',
							value: { enabled: true },
						}),
						setSchemaFieldOption({
							contributionId: 'search-value',
							field: 'title',
							name: 'search',
							value: { weight: 30 },
						}),
						addSchemaIndex({
							contributionId: 'title-index',
							fields: ['title', 'summary'],
							unique: true,
						}),
					],
				})
			},
		})
		await (
			await createApplication({
				plugins: [optionPlugin(), contributor],
				schemas: [Post],
			})
		).dispose()
		expect(Reflect.get(Post.definition, 'workflow')).toEqual({ enabled: true })
		expect(
			Reflect.get(requireField(Post.fields.title).options, 'search'),
		).toEqual({ weight: 30 })
		expect(Post.indexes).toEqual([
			{ fields: ['title', 'summary'], unique: true },
		])
		expect(Post.provenance.options.workflow?.value).toMatchObject({
			contributionId: 'workflow-value',
			owner: { pluginId: 'fixture.option-index-addition' },
		})
		expect(Post.provenance.fieldOptions.title?.search?.value).toMatchObject({
			contributionId: 'search-value',
			owner: { pluginId: 'fixture.option-index-addition' },
		})
	})

	it('adds stable schemas and freezes selectors before later plugin additions', async () => {
		const Post = Schema.define({
			className: 'SelectedPost',
			fields: (field) => ({ title: field.string() }),
		})
		const Author = Schema.define({
			className: 'SelectedAuthor',
			fields: (field) => ({ name: field.string() }),
		})
		const AuditLog = Schema.define({
			className: 'LaterAuditLog',
			fields: (field) => ({ message: field.string() }),
		})
		const patcher = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.schema-patcher',
			privileges: [
				{
					name: 'schema:declare',
					reason: 'Adds fields and indexes to prior schemas.',
				},
			] as const,
			version: '1.0.0',
			declare: ({ schemas }) => {
				const priorSchemas = schemas.select({})
				const posts = schemas.select({ className: 'SelectedPost' })
				schemas.patch({
					operations: [
						addSchemaField({
							contributionId: 'workflow-state',
							field: stringField(),
							name: 'workflowState',
						}),
						addSchemaIndex({
							contributionId: 'workflow-state-index',
							fields: ['workflowState', 'createdAt'],
						}),
					],
					targets: priorSchemas,
				})
				schemas.patch({
					operations: [
						addSchemaField({
							contributionId: 'author-pointer',
							field: pointerField({ target: () => Author }),
							name: 'author',
						}),
					],
					targets: posts,
				})
			},
		})
		const additionStaticOptions = { channel: 'audit' }
		const schemaProvider = definePlugin({
			core: '^0.0.0',
			instanceId: 'audit',
			pluginId: 'fixture.schema-provider',
			privileges: [
				{
					name: 'schema:declare',
					reason: 'Adds an audit schema.',
				},
			] as const,
			version: '2.0.0',
			declare: ({ schemas }) => {
				schemas.add({
					contributionId: 'audit-log-schema',
					schema: AuditLog,
					staticOptions: additionStaticOptions,
				})
			},
		})

		const application = applicationFixture(
			await createApplication({
				plugins: [patcher, schemaProvider],
				schemas: [Post, Author],
			}),
		)
		await application.dispose()
		additionStaticOptions.channel = 'mutated'

		expect(application.schemas.values()).toEqual([Post, Author, AuditLog])
		expect(Post.fields.workflowState?.kind).toBe('string')
		expect(Post.indexes).toContainEqual({
			fields: ['workflowState', 'createdAt'],
			unique: false,
		})
		expect(AuditLog.fields.workflowState).toBeUndefined()
		expect(application.schemaTargets.get(Post, ['author'])).toBe(Author)
		expect(Post.provenance.fields.workflowState).toMatchObject({
			contributionId: 'workflow-state',
			owner: {
				kind: 'plugin',
				pluginId: 'fixture.schema-patcher',
				version: '1.0.0',
			},
		})
		expect(Post.provenance.indexes.at(-1)).toMatchObject({
			provenance: { contributionId: 'workflow-state-index' },
		})
		expect(AuditLog.provenance.schema).toMatchObject({
			contributionId: 'audit-log-schema',
			normalizedStaticOptions: { channel: 'audit' },
			owner: {
				instanceId: 'audit',
				kind: 'plugin',
				pluginId: 'fixture.schema-provider',
				version: '2.0.0',
			},
		})
	})

	it('does not let one plugin self-expand a selector with its own schema addition', async () => {
		const Owned = Schema.define({
			className: 'SelfExpansionGuard',
			fields: (field) => ({ title: field.string() }),
		})
		const plugin = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.self-expansion',
			privileges: [
				{
					name: 'schema:declare',
					reason: 'Proves selector snapshot behavior.',
				},
			] as const,
			version: '1.0.0',
			declare: ({ schemas }) => {
				const prior = schemas.select({})
				schemas.add({ contributionId: 'owned', schema: Owned })
				schemas.patch({
					operations: [
						addSchemaField({
							contributionId: 'late-field',
							field: stringField(),
							name: 'lateField',
						}),
					],
					targets: prior,
				})
			},
		})

		await (
			await createApplication({ plugins: [plugin], schemas: [] })
		).dispose()

		expect(Owned.fields.lateField).toBeUndefined()
	})

	it('scopes schema contribution IDs to the complete plugin instance identity', async () => {
		const Primary = Schema.define({
			className: 'RepeatedPluginPrimarySchema',
			fields: (field) => ({ title: field.string() }),
		})
		const Analytics = Schema.define({
			className: 'RepeatedPluginAnalyticsSchema',
			fields: (field) => ({ title: field.string() }),
		})
		const plugin = (
			instanceId: string,
			schema: typeof Primary | typeof Analytics,
		) =>
			definePlugin({
				core: '^0.0.0',
				instanceId,
				pluginId: 'fixture.repeated-schema-owner',
				privileges: [
					{
						name: 'schema:declare',
						reason: 'Declares one instance-local schema contribution.',
					},
				] as const,
				version: '1.0.0',
				declare: ({ schemas }) => {
					schemas.add({ contributionId: 'owned-schema', schema })
				},
			})

		const application = applicationFixture(
			await createApplication({
				pluginPrivileges: { logger: false },
				plugins: [plugin('primary', Primary), plugin('analytics', Analytics)],
				schemas: [],
			}),
		)
		await application.dispose()

		expect(application.schemas.values()).toStrictEqual([Primary, Analytics])
		expect(Primary.provenance.schema).toMatchObject({
			contributionId: 'owned-schema',
			owner: {
				instanceId: 'primary',
				pluginId: 'fixture.repeated-schema-owner',
			},
		})
		expect(Analytics.provenance.schema).toMatchObject({
			contributionId: 'owned-schema',
			owner: {
				instanceId: 'analytics',
				pluginId: 'fixture.repeated-schema-owner',
			},
		})
	})

	it('publishes no plugin schema and permanently closes compilation after a duplicate contribution', async () => {
		const First = Schema.define({
			className: 'AtomicDuplicateFirst',
			fields: (field) => ({ title: field.string() }),
		})
		const Second = Schema.define({
			className: 'AtomicDuplicateSecond',
			fields: (field) => ({ title: field.string() }),
		})
		const plugin = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.atomic-duplicate-schema',
			privileges: [
				{
					name: 'schema:declare',
					reason: 'Exercises atomic duplicate contribution rejection.',
				},
			] as const,
			version: '1.0.0',
			declare: ({ schemas }) => {
				schemas.add({ contributionId: 'duplicate', schema: First })
				schemas.add({ contributionId: 'duplicate', schema: Second })
			},
		})
		const application = applicationFixture(
			new FrameworkApplication({
				pluginPrivileges: { logger: false },
				plugins: [plugin],
				schemas: [],
			}),
		)

		let failure: unknown
		try {
			application.compileSchemas()
		} catch (error: unknown) {
			failure = error
		}

		expect(failure).toMatchObject({
			code: 'PLUGIN_DECLARATION_INVALID',
			cause: {
				message: 'Duplicate schema contributionId: duplicate',
			},
			internalDetails: {
				contributionId: 'duplicate',
				path: 'AtomicDuplicateSecond',
				pluginId: 'fixture.atomic-duplicate-schema',
			},
		})
		expect(application.schemas.values()).toStrictEqual([])
		expect(() => application.compileSchemas()).toThrow(failure)
		await expect(application.initialize()).rejects.toBe(failure)
		await expect(application.start()).rejects.toBe(failure)
		expect(application.schemas.values()).toStrictEqual([])
	})
})
