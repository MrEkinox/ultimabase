import { applicationFixture } from '../../tests/application-fixture.js'
import { describe, expect, it } from 'vitest'
import * as application from '../application/framework-application.js'
import { stringField, type FieldBuilder } from '../index.js'
import {
	defineCapability,
	defineFieldOption,
	plugin as createPlugin,
	contributeApplication,
	contributeDeclarations,
	withPluginPrivileges,
	defineSchemaOption,
	provideCapability,
	requireCapability,
	type SchemaOptionRuntimeCompilationContext,
} from '../plugin.js'
import {
	requireField,
	optionPlugin,
} from '../../tests/plugins/schema-declarations.fixtures.js'
import { UltimaBase } from '../runtime/application/ultima-base.js'
const { createApplication, FrameworkApplication } = application
describe('plugin schema option compilation', () => {
	it('normalizes closed field contexts and rejects contextual reuse before setup', async () => {
		const option = defineFieldOption({
			contexts: ['output', 'stored'],
			normalize: (value) => Boolean(value),
			protocolVersion: 1,
		})
		expect(option.contexts).toStrictEqual(['stored', 'output'])
		expect(Object.isFrozen(option.contexts)).toBe(true)
		expect(() =>
			defineFieldOption({
				contexts: [],
				normalize: (value) => value,
				protocolVersion: 1,
			}),
		).toThrow('Field option contexts must be a non-empty list')
		expect(() =>
			defineFieldOption({
				contexts: ['stored', 'stored'],
				normalize: (value) => value,
				protocolVersion: 1,
			}),
		).toThrow('Field option contexts contains duplicate context: stored')

		const setup: string[] = []
		const storedOnly = defineFieldOption({
			contexts: ['stored'],
			normalize: (value) => Boolean(value),
			protocolVersion: 1,
		})
		const plugin = createPlugin({
			core: '^0.0.0',
			id: 'fixture.contextual-option-plugin',
			permissions: { 'schema:declare': 'Declares a contextual option.' },
			version: '1.0.0',
			contributions: [
				contributeDeclarations({
					schema: ({ schemas }) => {
						schemas.defineOptions({
							contributionId: 'contextual-options',
							field: { contextual: storedOnly },
						})

						return undefined
					},
				}),
				withPluginPrivileges(
					contributeApplication(() => {
						setup.push('setup')
						return { exports: undefined }
					}),
					['schema:declare'],
				),
			],
		})
		const shared = stringField({ contextual: true } as never)
		const Reused = UltimaBase.Schema.define({
			className: 'ContextualOptionReuse',
			fields: (field) => ({
				root: shared,
				value: field.object({ fields: () => ({ nested: shared }) }),
			}),
		})

		await expect(
			createApplication({ plugins: [plugin], schemas: [Reused] }),
		).rejects.toMatchObject({
			code: 'PLUGIN_DECLARATION_INVALID',
			cause: {
				message:
					'Field option "contextual" from fixture.contextual-option-plugin does not support the embedded context',
			},
		})
		expect(setup).toStrictEqual([])
	})

	it('rejects the Typegen descriptor removed with Typegen (ADR-0297)', () => {
		const defineUntyped = defineSchemaOption as (definition: unknown) => unknown
		expect(() =>
			defineUntyped({
				normalize: (value: unknown) => value,
				protocolVersion: 1,
				typegen: false,
			}),
		).toThrow('Unknown schema option definition key: typegen')
	})

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
		const runtimeOptionDefinition = {
			normalize: (value: unknown, path: string) => {
				if (typeof value !== 'string') {
					throw new TypeError(`${path} must be a string`)
				}
				return value
			},
			protocolVersion: 1,
			runtime: {
				compile: (
					context: SchemaOptionRuntimeCompilationContext<
						string,
						typeof requirement
					>,
				) => {
					context.capability.register(
						`runtime:${context.scope}:${context.path}:${context.value}:${context.provenance.value.owner.kind}`,
					)
					return undefined
				},
				requirement,
			},
		} as const
		const runtimeOption = defineSchemaOption(runtimeOptionDefinition)
		const runtimeFieldOption = defineFieldOption({
			...runtimeOptionDefinition,
			contexts: ['stored'],
		})
		const provider = createPlugin({
			core: '^0.0.0',
			id: 'fixture.schema-option-runtime-provider',
			version: '1.0.0',
			contributions: [
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
				contributeApplication(() => {
					events.push('provider:setup')
					return { exports: undefined }
				}),
			],
		})
		const owner = createPlugin({
			core: '^0.0.0',
			dependencies: [
				{
					pluginId: 'fixture.schema-option-runtime-provider',
					version: '^1.0.0',
				},
			],
			id: 'fixture.schema-option-runtime-owner',
			permissions: {
				'schema:declare': 'Declares options with Runtime compilation.',
			},
			version: '1.0.0',
			contributions: [
				requirement,
				contributeDeclarations({
					schema: ({ schemas }) => {
						schemas.defineOptions({
							contributionId: 'runtime-options',
							field: {
								runtimeTag: runtimeFieldOption,
								unusedRuntimeTag: runtimeFieldOption,
							},
							schema: {
								runtimeTag: runtimeOption,
								unusedRuntimeTag: runtimeOption,
							},
						})

						return undefined
					},
				}),
				withPluginPrivileges(
					contributeApplication(() => {
						events.push('owner:setup')
						return { exports: undefined }
					}),
					['schema:declare'],
				),
			],
		})
		const Post = UltimaBase.Schema.define({
			className: 'RuntimeOptionPost',
			fields: (field: FieldBuilder) => ({
				title: field.string({
					// @ts-expect-error -- Typegen owns the installed direct option type.
					runtimeTag: 'field',
				}),
			}),
		} as never).with({
			runtimeTag: 'schema',
		} as never)

		const application = applicationFixture(
			new FrameworkApplication({
				logger: false,
				plugins: [owner, provider],
				schemas: [Post],
			}),
		)
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
		})
		const provider = createPlugin({
			core: '^0.0.0',
			id: 'fixture.failing-schema-option-runtime-provider',
			version: '1.0.0',
			contributions: [
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
				contributeApplication(() => {
					events.push('provider:setup')
					return { exports: undefined }
				}),
			],
		})
		const owner = createPlugin({
			core: '^0.0.0',
			dependencies: [
				{
					pluginId: 'fixture.failing-schema-option-runtime-provider',
					version: '^1.0.0',
				},
			],
			id: 'fixture.failing-schema-option-runtime-owner',
			permissions: { 'schema:declare': 'Declares one failing Runtime option.' },
			version: '1.0.0',
			contributions: [
				requirement,
				contributeDeclarations({
					schema: ({ schemas }) => {
						schemas.defineOptions({
							contributionId: 'runtime-options',
							schema: { runtimeTag: runtimeOption },
						})

						return undefined
					},
				}),
			],
		})
		const Post = UltimaBase.Schema.define({
			className: 'FailingRuntimeOptionPost',
			fields: () => ({}),
		} as never).with({
			runtimeTag: 'fail',
		} as never)

		const application = applicationFixture(
			new FrameworkApplication({
				logger: false,
				plugins: [owner, provider],
				schemas: [Post],
			}),
		)
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
		const Post = UltimaBase.Schema.define({
			className: 'OwnedOptionPost',
			fields: (field: FieldBuilder) => ({
				title: field.string({
					// @ts-expect-error -- Typegen owns the installed direct option type.
					search,
				}),
			}),
		} as never).with({
			workflow,
		} as never)

		applicationFixture(
			await createApplication({ plugins: [optionPlugin()], schemas: [Post] }),
		)

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
		const UnknownSchemaOption = UltimaBase.Schema.define({
			className: 'UnknownSchemaOption',
			fields: (field: FieldBuilder) => ({ title: field.string() }),
		} as never).with({
			workflow: { enabled: true },
		} as never)
		const UnknownFieldOption = UltimaBase.Schema.define({
			className: 'UnknownFieldOption',
			fields: (field) => ({
				title: field.string({
					// @ts-expect-error -- Typegen owns installed option types.
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
		const unusedOptionDefinition = {
			normalize: (value: unknown) => {
				normalizations += 1
				return String(value)
			},
			protocolVersion: 1,
		} as const
		const unusedOption = defineSchemaOption(unusedOptionDefinition)
		const unusedFieldOption = defineFieldOption({
			...unusedOptionDefinition,
			contexts: ['stored'],
		})
		const plugin = (pluginId: string) =>
			createPlugin({
				core: '^0.0.0',
				id: pluginId,
				permissions: {
					'schema:declare':
						'Declares one deliberately shared unused option name.',
				},
				version: '1.0.0',
				contributions: [
					contributeDeclarations({
						schema: ({ schemas }) => {
							schemas.defineOptions({
								contributionId: 'shared-options',
								field: { shared: unusedFieldOption },
								schema: { shared: unusedOption },
							})

							return undefined
						},
					}),
				],
			})

		const application = applicationFixture(
			await createApplication({
				logger: false,
				plugins: [
					plugin('fixture.first-options'),
					plugin('fixture.second-options'),
				],
				schemas: [],
			}),
		)

		expect(normalizations).toBe(0)
		await application.dispose()
	})

	it('uses the exact contributing owner when duplicate option names are plugin-owned', async () => {
		const First = UltimaBase.Schema.define({
			className: 'ExactOptionOwnerFirst',
			fields: () => ({}),
		} as never).with({
			shared: 'value',
		} as never)
		const Second = UltimaBase.Schema.define({
			className: 'ExactOptionOwnerSecond',
			fields: () => ({}),
		} as never).with({
			shared: 'value',
		} as never)
		const plugin = (pluginId: string, schema: typeof First, prefix: string) =>
			createPlugin({
				core: '^0.0.0',
				id: pluginId,
				permissions: { 'schema:declare': 'Owns one direct option.' },
				version: '1.0.0',
				contributions: [
					contributeDeclarations({
						schema: ({ schemas }) => {
							schemas.defineOptions({
								contributionId: 'options',
								schema: {
									shared: defineSchemaOption({
										normalize: (value) => `${prefix}:${String(value)}`,
										protocolVersion: 1,
									}),
								},
							})
							schemas.add({ contributionId: 'schema', schema })

							return undefined
						},
					}),
				],
			})

		applicationFixture(
			await createApplication({
				logger: false,
				plugins: [
					plugin('fixture.first-exact-option', First, 'first'),
					plugin('fixture.second-exact-option', Second, 'second'),
				],
				schemas: [],
			}),
		)

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
			// @ts-expect-error -- Typegen owns the installed direct option type.
			shared: 'value',
		})
		const First = UltimaBase.Schema.define({
			className: 'ExactFieldOptionOwnerFirst',
			fields: () => ({ title: sharedField }),
		})
		const Second = UltimaBase.Schema.define({
			className: 'ExactFieldOptionOwnerSecond',
			fields: () => ({ title: sharedField }),
		})
		const plugin = (
			pluginId: string,
			schema: typeof First | typeof Second,
			prefix: string,
		) =>
			createPlugin({
				core: '^0.0.0',
				id: pluginId,
				permissions: { 'schema:declare': 'Owns one direct field option.' },
				version: '1.0.0',
				contributions: [
					contributeDeclarations({
						schema: ({ schemas }) => {
							schemas.defineOptions({
								contributionId: 'options',
								field: {
									shared: defineFieldOption({
										contexts: ['stored'],
										normalize: (value) => `${prefix}:${String(value)}`,
										protocolVersion: 1,
									}),
								},
							})
							schemas.add({ contributionId: 'schema', schema })

							return undefined
						},
					}),
				],
			})

		applicationFixture(
			await createApplication({
				logger: false,
				plugins: [
					plugin('fixture.first-exact-field-option', First, 'first'),
					plugin('fixture.second-exact-field-option', Second, 'second'),
				],
				schemas: [],
			}),
		)

		const firstTitle = requireField(First.fields.title)
		const secondTitle = requireField(Second.fields.title)
		expect(Reflect.get(firstTitle.options, 'shared')).toBe('first:value')
		expect(Reflect.get(secondTitle.options, 'shared')).toBe('second:value')
	})
})
