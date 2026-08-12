import { describe, expect, it } from 'vitest'
import {
	FrameworkApplication,
	Schema,
	createApplication,
	defineCapability,
	definePlugin,
	defineSchemaOption,
	provideCapability,
	requireCapability,
	stringField,
	type SchemaOptions,
} from '../index.js'

import {
	jsonObjectOption,
	requireField,
	optionPlugin,
} from '../../tests/plugins/schema-declarations.fixtures.js'

describe('plugin schema option compilation', () => {
	it('rejects setup-phase requirements for pre-setup Runtime option compilers', () => {
		const token = defineCapability<{ readonly register: () => void }>()({
			capabilityId: 'fixture.schema-option-setup-phase',
			cardinality: 'single',
			compose: ([provider]) => provider,
			lifetime: 'application',
			version: '1.0.0',
		})
		const requirement = requireCapability(token, '^1.0.0', {
			phase: 'setup',
		})

		expect(() =>
			defineSchemaOption({
				normalize: (value) => String(value),
				protocolVersion: 1,
				runtime: {
					compile: () => undefined,
					// @ts-expect-error -- The runtime assertion protects JavaScript callers too.
					requirement,
				},
				typegen: {
					module: '@fixture/schema-option-setup-phase',
					type: 'SetupPhaseOption',
				},
			}),
		).toThrow(
			'Schema option runtime.requirement must use the materialization phase',
		)
	})

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

		const application = new FrameworkApplication({
			pluginPrivileges: { logger: false },
			plugins: [owner, provider],
			schemas: [Post],
		})
		let failure: unknown
		try {
			await application.initialize()
		} catch (error: unknown) {
			failure = error
		}
		expect(failure).toMatchObject({
			code: 'PLUGIN_DECLARATION_INVALID',
			cause: { message: 'Runtime compilation failed' },
			internalDetails: {
				contributionId: 'runtime-options:schema:runtimeTag',
				path: 'FailingRuntimeOptionPost.runtimeTag',
				pluginId: 'fixture.failing-schema-option-runtime-owner',
			},
		})
		expect(() => application.compileSchemas()).toThrow(failure)
		await expect(application.initialize()).rejects.toBe(failure)
		await expect(application.start()).rejects.toBe(failure)
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
		).rejects.toMatchObject({
			code: 'PLUGIN_DECLARATION_INVALID',
			cause: {
				message: 'Unknown schema option: workflow',
			},
		})
		await expect(
			createApplication({ plugins: [], schemas: [UnknownFieldOption] }),
		).rejects.toMatchObject({
			code: 'PLUGIN_DECLARATION_INVALID',
			cause: {
				message: 'Unknown string field option: search',
			},
		})
	})

	it('ignores duplicate unused option descriptors until an occurrence needs an owner', async () => {
		let normalizations = 0
		const unusedOption = defineSchemaOption({
			normalize: (value) => {
				normalizations += 1
				return String(value)
			},
			protocolVersion: 1,
			typegen: {
				module: '@fixture/unused-option-plugin',
				type: 'UnusedOption',
			},
		})
		const plugin = (pluginId: string) =>
			definePlugin({
				core: '^0.0.0',
				pluginId,
				privileges: [
					{
						name: 'schema:declare',
						reason: 'Declares one deliberately shared unused option name.',
					},
				] as const,
				version: '1.0.0',
				declare: ({ schemas }) => {
					schemas.defineOptions({
						contributionId: 'shared-options',
						field: { shared: unusedOption },
						schema: { shared: unusedOption },
					})
				},
			})

		const application = await createApplication({
			pluginPrivileges: { logger: false },
			plugins: [
				plugin('fixture.first-options'),
				plugin('fixture.second-options'),
			],
			schemas: [],
		})

		expect(normalizations).toBe(0)
		await application.dispose()
	})

	it('uses the exact contributing owner when duplicate option names are plugin-owned', async () => {
		const First = Schema.define({
			className: 'ExactOptionOwnerFirst',
			fields: () => ({}),
			shared: 'value',
		} as SchemaOptions<'ExactOptionOwnerFirst'> & { readonly shared: string })
		const Second = Schema.define({
			className: 'ExactOptionOwnerSecond',
			fields: () => ({}),
			shared: 'value',
		} as SchemaOptions<'ExactOptionOwnerSecond'> & { readonly shared: string })
		const plugin = (
			pluginId: string,
			schema: typeof First | typeof Second,
			prefix: string,
		) =>
			definePlugin({
				core: '^0.0.0',
				pluginId,
				privileges: [
					{ name: 'schema:declare', reason: 'Owns one direct option.' },
				] as const,
				version: '1.0.0',
				declare: ({ schemas }) => {
					schemas.defineOptions({
						contributionId: 'options',
						schema: {
							shared: defineSchemaOption({
								normalize: (value) => `${prefix}:${String(value)}`,
								protocolVersion: 1,
								typegen: {
									module: '@fixture/exact-option-owner',
									type: 'SharedOption',
								},
							}),
						},
					})
					schemas.add({ contributionId: 'schema', schema })
				},
			})

		await createApplication({
			pluginPrivileges: { logger: false },
			plugins: [
				plugin('fixture.first-exact-option', First, 'first'),
				plugin('fixture.second-exact-option', Second, 'second'),
			],
			schemas: [],
		})

		expect(Reflect.get(First.definition, 'shared')).toBe('first:value')
		expect(Reflect.get(Second.definition, 'shared')).toBe('second:value')
		expect(First.provenance.options.shared?.definition.owner).toMatchObject({
			pluginId: 'fixture.first-exact-option',
		})
		expect(Second.provenance.options.shared?.definition.owner).toMatchObject({
			pluginId: 'fixture.second-exact-option',
		})
	})

	it('does not reuse an owner-specific field normalization across plugin schemas', async () => {
		const sharedField = stringField({
			// @ts-expect-error -- Issue 1408 will generate the direct option type.
			shared: 'value',
		})
		const First = Schema.define({
			className: 'ExactFieldOptionOwnerFirst',
			fields: () => ({ title: sharedField }),
		})
		const Second = Schema.define({
			className: 'ExactFieldOptionOwnerSecond',
			fields: () => ({ title: sharedField }),
		})
		const plugin = (
			pluginId: string,
			schema: typeof First | typeof Second,
			prefix: string,
		) =>
			definePlugin({
				core: '^0.0.0',
				pluginId,
				privileges: [
					{ name: 'schema:declare', reason: 'Owns one direct field option.' },
				] as const,
				version: '1.0.0',
				declare: ({ schemas }) => {
					schemas.defineOptions({
						contributionId: 'options',
						field: {
							shared: defineSchemaOption({
								normalize: (value) => `${prefix}:${String(value)}`,
								protocolVersion: 1,
								typegen: {
									module: '@fixture/exact-field-option-owner',
									type: 'SharedFieldOption',
								},
							}),
						},
					})
					schemas.add({ contributionId: 'schema', schema })
				},
			})

		await createApplication({
			pluginPrivileges: { logger: false },
			plugins: [
				plugin('fixture.first-exact-field-option', First, 'first'),
				plugin('fixture.second-exact-field-option', Second, 'second'),
			],
			schemas: [],
		})

		const firstTitle = requireField(First.fields.title)
		const secondTitle = requireField(Second.fields.title)
		expect(Reflect.get(firstTitle.options, 'shared')).toBe('first:value')
		expect(Reflect.get(secondTitle.options, 'shared')).toBe('second:value')
	})

	it('rejects an actually used option when no exact owner can be selected', async () => {
		const Ambiguous = Schema.define({
			className: 'AmbiguousOptionOwner',
			fields: (field) => ({ title: field.string() }),
			workflow: { enabled: true },
		} as SchemaOptions<'AmbiguousOptionOwner'> & {
			readonly workflow: Readonly<{ readonly enabled: boolean }>
		})

		await expect(
			createApplication({
				pluginPrivileges: { logger: false },
				plugins: [
					optionPlugin('fixture.first-options'),
					optionPlugin('fixture.second-options'),
				],
				schemas: [Ambiguous],
			}),
		).rejects.toMatchObject({
			code: 'PLUGIN_DECLARATION_INVALID',
			cause: {
				message:
					'Ambiguous schema option owner for "workflow": fixture.first-options and fixture.second-options',
			},
		})
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
})
