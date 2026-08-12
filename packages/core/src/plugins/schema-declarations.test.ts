import { describe, expect, it } from 'vitest'

import {
	FrameworkApplication,
	Schema,
	addSchemaConstraint,
	addSchemaExtension,
	addSchemaField,
	addSchemaIndex,
	createApplication,
	defineCapability,
	definePlugin,
	defineSchemaConstraint,
	defineSchemaExtension,
	defineSchemaOption,
	removeSchemaConstraint,
	removeSchemaExtension,
	removeSchemaField,
	removeSchemaFieldOption,
	removeSchemaIndex,
	removeSchemaOption,
	renameSchemaField,
	replaceSchemaConstraint,
	replaceSchemaExtension,
	replaceSchemaField,
	replaceSchemaIndex,
	provideCapability,
	pointerField,
	requireCapability,
	setSchemaFieldOption,
	setSchemaOption,
	stringField,
	type GenericField,
	type SchemaOptions,
} from '../index.js'
import { isPlainRecord } from '@ultimabase/shared'
import { snapshotJsonValue } from '../schema/fields/builtins/json.js'

const jsonObjectOption = defineSchemaOption({
	normalize: (value, path) => {
		if (!isPlainRecord(value)) {
			throw new TypeError(`${path} must be an object`)
		}

		return snapshotJsonValue(value, path)
	},
	protocolVersion: 1,
	typegen: {
		module: '@fixture/schema-options-plugin',
		type: 'FixtureOption',
	},
})

const requireField = (field: GenericField | undefined): GenericField => {
	if (field === undefined) throw new TypeError('Expected schema field')
	return field
}

const optionPlugin = (pluginId = 'fixture.schema-options') =>
	definePlugin({
		core: '^0.0.0',
		pluginId,
		privileges: [
			{
				name: 'schema:declare',
				reason: 'Declares direct test options.',
			},
		] as const,
		version: '1.2.3',
		declare: ({ schemas }) => {
			schemas.defineOptions({
				contributionId: 'fixture-options',
				field: { search: jsonObjectOption },
				schema: { workflow: jsonObjectOption },
			})
		},
	})

describe('plugin schema declarations', () => {
	it('runs used option compilers after capability materialization and before setup', async () => {
		const events: string[] = []
		interface RuntimeRegistry {
			register(event: string): void
		}
		const token = defineCapability<RuntimeRegistry>()({
			capabilityId: 'fixture.schema-option-runtime',
			cardinality: 'single',
			compose: ([provider]) => provider,
			lifetime: 'application',
			version: '1.0.0',
		})
		const requirement = requireCapability(token, '^1.0.0')
		const runtimeOption = defineSchemaOption({
			normalize: (value, path) => {
				if (typeof value !== 'string') {
					throw new TypeError(`${path} must be a string`)
				}
				return value
			},
			protocolVersion: 1,
			runtime: {
				compile: (context) => {
					context.capability.register(
						`runtime:${context.scope}:${context.path}:${context.value}:${context.provenance.value.owner.kind}`,
					)
					return undefined
				},
				requirement,
			},
			typegen: {
				module: '@fixture/schema-option-runtime-plugin',
				type: 'RuntimeOption',
			},
		})
		const provider = definePlugin({
			capabilities: {
				provides: [
					provideCapability(token, {
						contributionId: 'runtime-registry',
						create: () => {
							events.push('capability:create')
							return {
								dispose: () => {
									events.push('capability:dispose')
								},
								value: {
									register: (event) => events.push(event),
								},
							}
						},
					}),
				],
			},
			core: '^0.0.0',
			pluginId: 'fixture.schema-option-runtime-provider',
			setup: () => {
				events.push('provider:setup')
			},
			version: '1.0.0',
		})
		const owner = definePlugin({
			capabilities: { requires: [requirement] },
			core: '^0.0.0',
			dependencies: [
				{
					pluginId: 'fixture.schema-option-runtime-provider',
					version: '^1.0.0',
				},
			],
			pluginId: 'fixture.schema-option-runtime-owner',
			privileges: [
				{
					name: 'schema:declare',
					reason: 'Declares options with Runtime compilation.',
				},
			] as const,
			setup: () => {
				events.push('owner:setup')
			},
			version: '1.0.0',
			declare: ({ schemas }) => {
				schemas.defineOptions({
					contributionId: 'runtime-options',
					field: {
						runtimeTag: runtimeOption,
						unusedRuntimeTag: runtimeOption,
					},
					schema: {
						runtimeTag: runtimeOption,
						unusedRuntimeTag: runtimeOption,
					},
				})
			},
		})
		const Post = Schema.define({
			className: 'RuntimeOptionPost',
			fields: (field) => ({
				title: field.string({
					// @ts-expect-error -- Issue 1408 will generate the direct option type.
					runtimeTag: 'field',
				}),
			}),
			runtimeTag: 'schema',
		} as SchemaOptions<'RuntimeOptionPost'> & {
			readonly runtimeTag: string
		})

		const application = new FrameworkApplication({
			pluginPrivileges: { logger: false },
			plugins: [owner, provider],
			schemas: [Post],
		})
		application.compileSchemas()
		expect(events).toEqual([])
		await application.initialize()

		expect(events).toStrictEqual([
			'capability:create',
			'runtime:schema:RuntimeOptionPost.runtimeTag:schema:application',
			'runtime:field:RuntimeOptionPost.fields.title.options.runtimeTag:field:application',
			'provider:setup',
			'owner:setup',
		])

		await application.dispose()
		expect(events.at(-1)).toBe('capability:dispose')
	})

	it('disposes materialized capabilities when an option compiler fails', async () => {
		const events: string[] = []
		const token = defineCapability<Readonly<{ active: true }>>()({
			capabilityId: 'fixture.failing-schema-option-runtime',
			cardinality: 'single',
			compose: ([provider]) => provider,
			lifetime: 'application',
			version: '1.0.0',
		})
		const requirement = requireCapability(token, '^1.0.0')
		const runtimeOption = defineSchemaOption({
			normalize: (value) => String(value),
			protocolVersion: 1,
			runtime: {
				compile: () => {
					events.push('runtime:compile')
					throw new Error('Runtime compilation failed')
				},
				requirement,
			},
			typegen: {
				module: '@fixture/failing-schema-option-runtime-plugin',
				type: 'FailingRuntimeOption',
			},
		})
		const provider = definePlugin({
			capabilities: {
				provides: [
					provideCapability(token, {
						contributionId: 'runtime-registry',
						create: () => {
							events.push('capability:create')
							return {
								dispose: () => {
									events.push('capability:dispose')
								},
								value: { active: true },
							}
						},
					}),
				],
			},
			core: '^0.0.0',
			pluginId: 'fixture.failing-schema-option-runtime-provider',
			setup: () => {
				events.push('provider:setup')
			},
			version: '1.0.0',
		})
		const owner = definePlugin({
			capabilities: { requires: [requirement] },
			core: '^0.0.0',
			dependencies: [
				{
					pluginId: 'fixture.failing-schema-option-runtime-provider',
					version: '^1.0.0',
				},
			],
			pluginId: 'fixture.failing-schema-option-runtime-owner',
			privileges: [
				{
					name: 'schema:declare',
					reason: 'Declares one failing Runtime option.',
				},
			] as const,
			version: '1.0.0',
			declare: ({ schemas }) => {
				schemas.defineOptions({
					contributionId: 'runtime-options',
					schema: { runtimeTag: runtimeOption },
				})
			},
		})
		const Post = Schema.define({
			className: 'FailingRuntimeOptionPost',
			fields: () => ({}),
			runtimeTag: 'fail',
		} as SchemaOptions<'FailingRuntimeOptionPost'> & {
			readonly runtimeTag: string
		})

		await expect(
			createApplication({
				pluginPrivileges: { logger: false },
				plugins: [owner, provider],
				schemas: [Post],
			}),
		).rejects.toThrow('Runtime compilation failed')
		expect(events).toStrictEqual([
			'capability:create',
			'runtime:compile',
			'capability:dispose',
		])
	})

	it('resolves direct schema and field options through their exact installed owner', async () => {
		const workflow = { enabled: true }
		const search = { weight: 10 }
		const Post = Schema.define({
			className: 'OwnedOptionPost',
			fields: (field) => ({
				title: field.string({
					// @ts-expect-error -- Issue 1408 will generate the direct option type.
					search,
				}),
			}),
			workflow,
		} as SchemaOptions<'OwnedOptionPost'> & {
			readonly workflow: Readonly<{ readonly enabled: boolean }>
		})

		await createApplication({ plugins: [optionPlugin()], schemas: [Post] })

		workflow.enabled = false
		search.weight = 0
		const title = requireField(Post.fields.title)
		expect(Reflect.get(Post.definition, 'workflow')).toEqual({ enabled: true })
		expect(Reflect.get(title.options, 'search')).toEqual({
			weight: 10,
		})
		expect(Object.isFrozen(Reflect.get(Post.definition, 'workflow'))).toBe(true)
		expect(Object.isFrozen(Reflect.get(title.options, 'search'))).toBe(true)
		expect(Post.provenance.options.workflow).toMatchObject({
			definition: {
				owner: {
					kind: 'plugin',
					pluginId: 'fixture.schema-options',
					version: '1.2.3',
				},
				protocolVersion: 1,
			},
			value: { owner: { kind: 'application' } },
		})
		expect(Post.provenance.fieldOptions.title?.search).toMatchObject({
			definition: {
				owner: { pluginId: 'fixture.schema-options' },
			},
			value: { owner: { kind: 'application' } },
		})
	})

	it('keeps the existing unknown-option failures when no plugin owns a used key', async () => {
		const UnknownSchemaOption = Schema.define({
			className: 'UnknownSchemaOption',
			fields: (field) => ({ title: field.string() }),
			workflow: { enabled: true },
		} as SchemaOptions<'UnknownSchemaOption'> & {
			readonly workflow: Readonly<{ readonly enabled: boolean }>
		})
		const UnknownFieldOption = Schema.define({
			className: 'UnknownFieldOption',
			fields: (field) => ({
				title: field.string({
					// @ts-expect-error -- Issue 1408 will generate installed option types.
					search: { weight: 10 },
				}),
			}),
		})

		await expect(
			createApplication({ plugins: [], schemas: [UnknownSchemaOption] }),
		).rejects.toThrow('Unknown schema option: workflow')
		await expect(
			createApplication({ plugins: [], schemas: [UnknownFieldOption] }),
		).rejects.toThrow('Unknown string field option: search')
	})

	it('rejects ambiguous owners before an option can use last-writer-wins', async () => {
		await expect(
			createApplication({
				plugins: [
					optionPlugin('fixture.first-options'),
					optionPlugin('fixture.second-options'),
				],
				schemas: [],
			}),
		).rejects.toThrow('Ambiguous schema option owner for "workflow"')
	})

	it('rejects plugin option names reserved by Core contracts', async () => {
		const schemaCollision = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.schema-option-collision',
			privileges: [
				{
					name: 'schema:declare',
					reason: 'Exercises Core schema option collision rejection.',
				},
			] as const,
			version: '1.0.0',
			declare: ({ schemas }) => {
				schemas.defineOptions({
					contributionId: 'collision',
					schema: { fields: jsonObjectOption },
				})
			},
		})
		const fieldCollision = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.field-option-collision',
			privileges: [
				{
					name: 'schema:declare',
					reason: 'Exercises Core field option collision rejection.',
				},
			] as const,
			version: '1.0.0',
			declare: ({ schemas }) => {
				schemas.defineOptions({
					contributionId: 'collision',
					field: { validation: jsonObjectOption },
				})
			},
		})

		await expect(
			createApplication({ plugins: [schemaCollision], schemas: [] }),
		).rejects.toThrow(
			'Plugin option collides with Core-owned schema option: fields',
		)
		await expect(
			createApplication({ plugins: [fieldCollision], schemas: [] }),
		).rejects.toThrow(
			'Plugin option collides with Core-owned field option: validation',
		)
	})

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

	it('requires exact ownership and shape for ordered cross-owner field transforms', async () => {
		const Post = Schema.define({
			className: 'TransformedPost',
			fields: (field) => ({
				description: field.string(),
				title: field.string(),
			}),
		})
		const originalTitle = Post.fields.title
		const originalDescription = Post.fields.description
		if (originalTitle === undefined || originalDescription === undefined) {
			throw new TypeError('Expected precompiled fixture fields')
		}
		const normalizedTitle = stringField({ validation: { required: true } })
		const transformer = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.schema-transformer',
			privileges: [
				{
					name: 'schema:transform',
					reason: 'Transforms exact application-owned fields.',
				},
			] as const,
			version: '3.0.0',
			declare: ({ schemas }) => {
				const post = schemas.select({ className: 'TransformedPost' })
				schemas.patch({
					operations: [
						replaceSchemaField({
							contributionId: 'required-title',
							field: normalizedTitle,
							name: 'title',
							target: {
								contributionId: 'field:TransformedPost.title',
								expected: originalTitle,
								owner: { kind: 'application' },
							},
						}),
						renameSchemaField({
							contributionId: 'headline-title',
							from: 'title',
							target: {
								contributionId: 'required-title',
								expected: normalizedTitle,
								owner: {
									kind: 'plugin',
									pluginId: 'fixture.schema-transformer',
								},
							},
							to: 'headline',
						}),
						removeSchemaField({
							contributionId: 'remove-description',
							name: 'description',
							target: {
								contributionId: 'field:TransformedPost.description',
								expected: originalDescription,
								owner: { kind: 'application' },
							},
						}),
					],
					targets: post,
				})
			},
		})

		await createApplication({ plugins: [transformer], schemas: [Post] })

		expect(Post.fields.title).toBeUndefined()
		expect(Post.fields.description).toBeUndefined()
		expect(Post.fields.headline?.options).toMatchObject({
			validation: { required: true },
		})
		expect(Post.provenance.fields.headline).toMatchObject({
			contributionId: 'headline-title',
			owner: {
				kind: 'plugin',
				pluginId: 'fixture.schema-transformer',
				version: '3.0.0',
			},
		})
		expect(Post.provenance.patches.map(({ kind }) => kind)).toEqual([
			'field:replace',
			'field:rename',
			'field:remove',
		])
	})

	it('rejects stale transform owners and protected Core identities', async () => {
		const Post = Schema.define({
			className: 'RejectedTransformPost',
			fields: (field) => ({ title: field.string() }),
		})
		const title = requireField(Post.fields.title)
		const stale = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.stale-transformer',
			privileges: [
				{
					name: 'schema:transform',
					reason: 'Exercises exact target rejection.',
				},
			] as const,
			version: '1.0.0',
			declare: ({ schemas }) => {
				schemas.patch({
					operations: [
						removeSchemaField({
							contributionId: 'stale-remove',
							name: 'title',
							target: {
								contributionId: 'field:RejectedTransformPost.title',
								expected: title,
								owner: {
									kind: 'plugin',
									pluginId: 'fixture.someone-else',
								},
							},
						}),
					],
					targets: schemas.select({ className: 'RejectedTransformPost' }),
				})
			},
		})

		await expect(
			createApplication({ plugins: [stale], schemas: [Post] }),
		).rejects.toThrow('Stale schema contribution owner')

		const Protected = Schema.define({
			className: 'ProtectedTransformPost',
			fields: (field) => ({ title: field.string() }),
		})
		const protectedId = Protected.fields.id
		const coreTransform = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.core-transformer',
			privileges: [
				{
					name: 'schema:transform',
					reason: 'Exercises protected target rejection.',
				},
			] as const,
			version: '1.0.0',
			declare: ({ schemas }) => {
				schemas.patch({
					operations: [
						removeSchemaField({
							contributionId: 'remove-id',
							name: 'id',
							target: {
								contributionId: 'field:ProtectedTransformPost.id',
								expected: protectedId,
								owner: { kind: 'core' },
							},
						}),
					],
					targets: schemas.select({ className: 'ProtectedTransformPost' }),
				})
			},
		})

		await expect(
			createApplication({ plugins: [coreTransform], schemas: [Protected] }),
		).rejects.toThrow('Protected Core schema contribution')
	})

	it('matches direct option paths and exact prior plugin owners', async () => {
		const Content = Schema.define({
			className: 'WorkflowContent',
			fields: (field) => ({ title: field.string() }),
			workflow: { enabled: true },
		} as SchemaOptions<'WorkflowContent'> & {
			readonly workflow: Readonly<{ readonly enabled: boolean }>
		})
		const Audit = Schema.define({
			className: 'WorkflowAudit',
			fields: (field) => ({ message: field.string() }),
			workflow: { enabled: true },
		} as SchemaOptions<'WorkflowAudit'> & {
			readonly workflow: Readonly<{ readonly enabled: boolean }>
		})
		const provider = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.workflow-schema-provider',
			privileges: [
				{
					name: 'schema:declare',
					reason: 'Provides one workflow-enabled schema.',
				},
			] as const,
			version: '1.0.0',
			declare: ({ schemas }) => {
				schemas.defineOptions({
					contributionId: 'workflow',
					schema: { workflow: jsonObjectOption },
				})
				schemas.add({ contributionId: 'workflow-audit', schema: Audit })
			},
		})
		const patcher = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.workflow-owner-selector',
			privileges: [
				{
					name: 'schema:declare',
					reason: 'Patches only a prior plugin-owned workflow schema.',
				},
			] as const,
			version: '1.0.0',
			declare: ({ schemas }) => {
				schemas.patch({
					operations: [
						addSchemaField({
							contributionId: 'selected-state',
							field: stringField(),
							name: 'selectedState',
						}),
					],
					targets: schemas.select({
						option: {
							equals: true,
							name: 'workflow',
							path: ['enabled'],
						},
						owner: {
							kind: 'plugin',
							pluginId: 'fixture.workflow-schema-provider',
						},
					}),
				})
			},
		})

		await createApplication({
			plugins: [provider, patcher],
			schemas: [Content],
		})

		expect(Content.fields.selectedState).toBeUndefined()
		expect(Audit.fields.selectedState?.kind).toBe('string')
	})

	it('registers all plugin schemas before resolving circular targets', async () => {
		const Left = Schema.define({
			className: 'PluginCircularLeft',
			fields: (field) => ({
				right: field.pointer({ target: 'PluginCircularRight' }),
			}),
		})
		const Right = Schema.define({
			className: 'PluginCircularRight',
			fields: (field) => ({
				left: field.pointer({ target: 'PluginCircularLeft' }),
			}),
		})
		const plugin = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.circular-schemas',
			privileges: [
				{
					name: 'schema:declare',
					reason: 'Declares two circular test schemas.',
				},
			] as const,
			version: '1.0.0',
			declare: ({ schemas }) => {
				schemas.add({ contributionId: 'left', schema: Left })
				schemas.add({ contributionId: 'right', schema: Right })
			},
		})

		const application = await createApplication({
			plugins: [plugin],
			schemas: [],
		})

		expect(application.schemaTargets.get(Left, ['right'])).toBe(Right)
		expect(application.schemaTargets.get(Right, ['left'])).toBe(Left)
	})

	it('adds and exactly transforms ordered schema extensions with their fields', async () => {
		const originalExtension = defineSchemaExtension(
			'fixture.original-extension',
			{ version: 1 },
			'fixture.extension-owner',
			{ fields: { originalMarker: stringField() } },
		)
		const replacementExtension = defineSchemaExtension(
			'fixture.replacement-extension',
			{ version: 2 },
			'fixture.extension-transformer',
			{ fields: { replacementMarker: stringField() } },
		)
		const addedExtension = defineSchemaExtension(
			'fixture.added-extension',
			{ enabled: true },
			'fixture.extension-transformer',
			{ fields: { addedMarker: stringField() } },
		)
		const Post = Schema.define({
			className: 'ExtensionTransformPost',
			extensions: [originalExtension],
			fields: (field) => ({ title: field.string() }),
		})
		const plugin = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.extension-transformer',
			privileges: [
				{
					name: 'schema:declare',
					reason: 'Adds one extension.',
				},
				{
					name: 'schema:transform',
					reason: 'Replaces one exact extension.',
				},
			] as const,
			version: '4.0.0',
			declare: ({ schemas }) => {
				const post = schemas.select({ className: 'ExtensionTransformPost' })
				schemas.patch({
					operations: [
						replaceSchemaExtension({
							contributionId: 'replacement-extension',
							extension: replacementExtension,
							target: {
								contributionId:
									'extension:ExtensionTransformPost:0:fixture.original-extension',
								expected: originalExtension,
								owner: { kind: 'application' },
							},
						}),
						addSchemaExtension({
							contributionId: 'added-extension',
							extension: addedExtension,
						}),
					],
					targets: post,
				})
			},
		})

		await createApplication({ plugins: [plugin], schemas: [Post] })

		expect(Post.extensions).toEqual([replacementExtension, addedExtension])
		expect(Post.fields.originalMarker).toBeUndefined()
		expect(Post.fields.replacementMarker?.kind).toBe('string')
		expect(Post.fields.addedMarker?.kind).toBe('string')
		expect(Post.provenance.extensions).toMatchObject([
			{ provenance: { contributionId: 'replacement-extension' } },
			{ provenance: { contributionId: 'added-extension' } },
		])

		const Removable = Schema.define({
			className: 'ExtensionRemovalPost',
			extensions: [originalExtension],
			fields: (field) => ({ title: field.string() }),
		})
		const remover = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.extension-remover',
			privileges: [
				{
					name: 'schema:transform',
					reason: 'Removes one exact extension.',
				},
			] as const,
			version: '1.0.0',
			declare: ({ schemas }) => {
				schemas.patch({
					operations: [
						removeSchemaExtension({
							contributionId: 'remove-original-extension',
							target: {
								contributionId:
									'extension:ExtensionRemovalPost:0:fixture.original-extension',
								expected: originalExtension,
								owner: { kind: 'application' },
							},
						}),
					],
					targets: schemas.select({ className: 'ExtensionRemovalPost' }),
				})
			},
		})

		await createApplication({ plugins: [remover], schemas: [Removable] })

		expect(Removable.extensions).toEqual([])
		expect(Removable.fields.originalMarker).toBeUndefined()
		expect(Removable.provenance.patches.at(-1)?.kind).toBe('extension:remove')
	})

	it('adds, replaces, and removes exact portable schema constraints', async () => {
		const originalConstraint = defineSchemaConstraint({
			kind: 'fixture.search-index',
			value: { fields: ['title'] },
			version: 1,
		})
		const replacementConstraint = defineSchemaConstraint({
			kind: 'fixture.search-index',
			value: { fields: ['title', 'summary'] },
			version: 2,
		})
		const Post = Schema.define({
			className: 'ConstraintTransformPost',
			fields: (field) => ({
				summary: field.string(),
				title: field.string(),
			}),
		})
		const contributor = (className: string) =>
			definePlugin({
				core: '^0.0.0',
				pluginId: 'fixture.constraint-contributor',
				privileges: [
					{
						name: 'schema:declare',
						reason: 'Adds one portable logical constraint.',
					},
				] as const,
				version: '1.0.0',
				declare: ({ schemas }) => {
					schemas.patch({
						operations: [
							addSchemaConstraint({
								constraint: originalConstraint,
								contributionId: 'search-index',
							}),
						],
						targets: schemas.select({ className }),
					})
				},
			})
		const transformer = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.constraint-transformer',
			privileges: [
				{
					name: 'schema:transform',
					reason: 'Replaces one exact portable logical constraint.',
				},
			] as const,
			version: '2.0.0',
			declare: ({ schemas }) => {
				schemas.patch({
					operations: [
						replaceSchemaConstraint({
							constraint: replacementConstraint,
							contributionId: 'replace-search-index',
							target: {
								contributionId: 'search-index',
								expected: originalConstraint,
								owner: {
									kind: 'plugin',
									pluginId: 'fixture.constraint-contributor',
								},
							},
						}),
					],
					targets: schemas.select({ className: 'ConstraintTransformPost' }),
				})
			},
		})

		await createApplication({
			plugins: [contributor('ConstraintTransformPost'), transformer],
			schemas: [Post],
		})

		expect(Post.constraints).toEqual([replacementConstraint])
		expect(Post.provenance.constraints).toMatchObject([
			{
				definition: replacementConstraint,
				provenance: {
					contributionId: 'replace-search-index',
					owner: { pluginId: 'fixture.constraint-transformer' },
				},
			},
		])

		const Removable = Schema.define({
			className: 'ConstraintRemovalPost',
			fields: (field) => ({ title: field.string() }),
		})
		const remover = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.constraint-remover',
			privileges: [
				{
					name: 'schema:transform',
					reason: 'Removes one exact portable logical constraint.',
				},
			] as const,
			version: '1.0.0',
			dependencies: [
				{
					pluginId: 'fixture.constraint-contributor',
					version: '^1.0.0',
				},
			],
			declare: ({ schemas }) => {
				schemas.patch({
					operations: [
						removeSchemaConstraint({
							contributionId: 'remove-search-index',
							target: {
								contributionId: 'search-index',
								expected: originalConstraint,
								owner: {
									kind: 'plugin',
									pluginId: 'fixture.constraint-contributor',
								},
							},
						}),
					],
					targets: schemas.select({ className: 'ConstraintRemovalPost' }),
				})
			},
		})

		await createApplication({
			plugins: [contributor('ConstraintRemovalPost'), remover],
			schemas: [Removable],
		})

		expect(Removable.constraints).toEqual([])
		expect(Removable.provenance.patches.at(-1)?.kind).toBe('constraint:remove')
	})
})
