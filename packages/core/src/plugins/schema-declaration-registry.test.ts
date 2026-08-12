import { describe, expect, it } from 'vitest'
import {
	FrameworkApplication,
	Schema,
	addSchemaField,
	addSchemaIndex,
	createApplication,
	definePlugin,
	defineSchemaOption,
	removeSchemaFieldOption,
	removeSchemaIndex,
	removeSchemaOption,
	replaceSchemaIndex,
	pointerField,
	setSchemaFieldOption,
	setSchemaOption,
	stringField,
	type SchemaOptions,
} from '../index.js'
import { isPlainRecord } from '@ultimabase/shared'
import { snapshotJsonValue } from '../schema/fields/builtins/json.js'

import {
	requireField,
	optionPlugin,
} from '../../tests/plugins/schema-declarations.fixtures.js'

describe('plugin schema declaration registry', () => {
	it('requires declaration authority for additions and rejects duplicate additions', async () => {
		const Post = Schema.define({
			className: 'AdditionPrivilegePost',
			fields: (field) => ({ title: field.string() }),
		})
		const transformOnly = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.transform-only-addition',
			privileges: [
				{
					name: 'schema:transform',
					reason: 'Exercises the exact addition privilege boundary.',
				},
			] as const,
			version: '1.0.0',
			declare: ({ schemas }) => {
				schemas.patch({
					operations: [
						addSchemaField({
							contributionId: 'unauthorized-field',
							field: stringField(),
							name: 'state',
						}),
					],
					targets: schemas.select({ className: 'AdditionPrivilegePost' }),
				})
			},
		})

		await expect(
			createApplication({ plugins: [transformOnly], schemas: [Post] }),
		).rejects.toThrow('schema:declare is required for additions')

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
		const first = new FrameworkApplication({
			pluginPrivileges: { logger: false },
			plugins: [owner],
			schemas: [Shared],
		})

		expect(first.compileSchemas()).toBe(first)
		expect(first.compileSchemas()).toBe(first)
		expect(normalizations).toBe(1)
		await first.initialize()
		expect(normalizations).toBe(1)

		await createApplication({
			pluginPrivileges: { logger: false },
			plugins: [owner],
			schemas: [Shared],
		})
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

		await createApplication({
			pluginPrivileges: { logger: false },
			plugins: [contributor],
			schemas: [Shared],
		})
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

	it('sets and removes exact option values and replaces and removes indexes', async () => {
		const workflow = { enabled: true }
		const search = { weight: 10 }
		const Post = Schema.define({
			className: 'OptionAndIndexTransformPost',
			fields: (field) => ({
				summary: field.string(),
				title: field.string({
					// @ts-expect-error -- Issue 1408 will generate the direct option type.
					search,
				}),
			}),
			indexes: [{ fields: ['title', 'summary'] }],
			workflow,
		} as SchemaOptions<'OptionAndIndexTransformPost'> & {
			readonly workflow: Readonly<{ readonly enabled: boolean }>
		})
		const originalIndex = Post.indexes[0]
		if (originalIndex === undefined) {
			throw new TypeError('Expected initial index')
		}
		const replacementIndex = {
			fields: ['summary', 'createdAt'] as const,
			unique: true,
		}
		const transformer = definePlugin({
			core: '^0.0.0',
			dependencies: [
				{
					pluginId: 'fixture.schema-options',
					version: '^1.2.3',
				},
			],
			pluginId: 'fixture.option-index-transformer',
			privileges: [
				{
					name: 'schema:declare',
					reason: 'Restores removed option values.',
				},
				{
					name: 'schema:transform',
					reason: 'Transforms exact option values and indexes.',
				},
			] as const,
			version: '1.0.0',
			declare: ({ schemas }) => {
				schemas.patch({
					operations: [
						addSchemaField({
							contributionId: 'plugin-field',
							field: stringField({
								// @ts-expect-error -- Issue 1408 will generate the direct option type.
								search: { weight: 40 },
							}),
							name: 'pluginField',
						}),
						setSchemaOption({
							contributionId: 'replace-workflow',
							name: 'workflow',
							target: {
								contributionId:
									'schema-option:OptionAndIndexTransformPost.workflow',
								expected: { enabled: true },
								owner: { kind: 'application' },
							},
							value: { enabled: false },
						}),
						removeSchemaOption({
							contributionId: 'remove-workflow',
							name: 'workflow',
							target: {
								contributionId: 'replace-workflow',
								expected: { enabled: false },
								owner: {
									kind: 'plugin',
									pluginId: 'fixture.option-index-transformer',
								},
							},
						}),
						setSchemaOption({
							contributionId: 'restore-workflow',
							name: 'workflow',
							value: { enabled: true },
						}),
						setSchemaFieldOption({
							contributionId: 'replace-search',
							field: 'title',
							name: 'search',
							target: {
								contributionId:
									'field-option:OptionAndIndexTransformPost.title.search',
								expected: { weight: 10 },
								owner: { kind: 'application' },
							},
							value: { weight: 20 },
						}),
						removeSchemaFieldOption({
							contributionId: 'remove-search',
							field: 'title',
							name: 'search',
							target: {
								contributionId: 'replace-search',
								expected: { weight: 20 },
								owner: {
									kind: 'plugin',
									pluginId: 'fixture.option-index-transformer',
								},
							},
						}),
						setSchemaFieldOption({
							contributionId: 'restore-search',
							field: 'title',
							name: 'search',
							value: { weight: 30 },
						}),
						replaceSchemaIndex({
							contributionId: 'replace-title-index',
							fields: replacementIndex.fields,
							target: {
								contributionId: 'index:OptionAndIndexTransformPost:0',
								expected: originalIndex,
								owner: { kind: 'application' },
							},
							unique: replacementIndex.unique,
						}),
						removeSchemaIndex({
							contributionId: 'remove-summary-index',
							target: {
								contributionId: 'replace-title-index',
								expected: replacementIndex,
								owner: {
									kind: 'plugin',
									pluginId: 'fixture.option-index-transformer',
								},
							},
						}),
					],
					targets: schemas.select({
						className: 'OptionAndIndexTransformPost',
					}),
				})
			},
		})

		await createApplication({
			plugins: [optionPlugin(), transformer],
			schemas: [Post],
		})

		expect(Reflect.get(Post.definition, 'workflow')).toEqual({ enabled: true })
		expect(
			Reflect.get(requireField(Post.fields.title).options, 'search'),
		).toEqual({ weight: 30 })
		expect(Post.indexes).toEqual([])
		expect(
			Reflect.get(requireField(Post.fields.pluginField).options, 'search'),
		).toEqual({ weight: 40 })
		expect(Post.provenance.fieldOptions.pluginField?.search).toMatchObject({
			definition: {
				owner: { pluginId: 'fixture.schema-options' },
			},
			value: {
				owner: { pluginId: 'fixture.option-index-transformer' },
			},
		})
		expect(Post.provenance.patches.map(({ kind }) => kind)).toEqual([
			'field:add',
			'schema-option:set',
			'schema-option:remove',
			'schema-option:set',
			'field-option:set',
			'field-option:remove',
			'field-option:set',
			'index:replace',
			'index:remove',
		])
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

		const application = await createApplication({
			plugins: [patcher, schemaProvider],
			schemas: [Post, Author],
		})
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

		await createApplication({ plugins: [plugin], schemas: [] })

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

		const application = await createApplication({
			pluginPrivileges: { logger: false },
			plugins: [plugin('primary', Primary), plugin('analytics', Analytics)],
			schemas: [],
		})

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
		const application = new FrameworkApplication({
			pluginPrivileges: { logger: false },
			plugins: [plugin],
			schemas: [],
		})

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
