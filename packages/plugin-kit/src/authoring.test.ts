import {
	FrameworkApplication,
	Schema,
	contributeOperation,
	defineOperation,
	defineOperationValue,
	definePlugin,
	definePluginModule,
	defineSchemaConstraint,
	defineSchemaOption,
	defineTypegenReference,
	stringField,
	type ResourcePluginOperationContributionOptions,
	type SchemaOptions,
} from '@ultimabase/core'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import {
	defineOutputDescriptor,
	definePluginFieldBuilderMethod,
	definePluginFieldOption,
	definePluginOptionsParser,
	patchSchemas,
	schemaPatch,
} from './index.js'

const fixtureModule = definePluginModule({
	core: '^0.0.0',
	pluginId: 'fixture.plugin-kit',
	version: '1.2.3',
})

describe('plugin authoring helpers', () => {
	it('preserves Core provenance for contextual field helpers', () => {
		const output = defineOutputDescriptor(
			'fixture.label-output',
			{ list: false, nullable: false },
			(value) => String(value),
		)
		const method = definePluginFieldBuilderMethod({
			name: 'label',
			contexts: {
				stored: {
					factory: stringField,
					fieldKind: 'fixture.label',
					typegen: {
						methodType: 'LabelFieldBuilderMethod',
						module: '@fixture/plugin-kit',
						valueType: 'LabelValue',
					},
				},
			},
		})
		const option = definePluginFieldOption({
			contexts: ['stored'],
			normalize: (value) => String(value),
			protocolVersion: 1,
			typegen: false,
		})
		const plugin = fixtureModule.plugin({
			declare: ({ fields, schemas }) => {
				fields.register(method)
				schemas.defineOptions({
					contributionId: 'label-option',
					field: { label: option },
				})
			},
			privileges: [
				{ name: 'schema:declare', reason: 'Declares contextual fixtures.' },
			],
		})

		expect(() =>
			new FrameworkApplication({
				plugins: [plugin],
				schemas: [],
			}).compileSchemas(),
		).not.toThrow()
		expect(output).toStrictEqual({
			kind: 'fixture.label-output',
			options: { list: false, nullable: false },
		})
		expect(Object.isFrozen(output.options)).toBe(true)
	})

	it('binds immutable package facts across explicit plugin instances', () => {
		const first = fixtureModule.plugin({
			instanceId: 'first',
			setup: () => ({ ready: true as const }),
		})
		const second = fixtureModule.plugin({ instanceId: 'second' })

		expect(fixtureModule).toMatchObject({
			core: '^0.0.0',
			pluginId: 'fixture.plugin-kit',
			version: '1.2.3',
		})
		expect(Object.isFrozen(fixtureModule)).toBe(true)
		expect(first.manifest.identity).toStrictEqual({
			instanceId: 'first',
			pluginId: 'fixture.plugin-kit',
		})
		expect(second.manifest.identity).toStrictEqual({
			instanceId: 'second',
			pluginId: 'fixture.plugin-kit',
		})

		const mutableFacts = {
			core: '^0.0.0',
			pluginId: 'fixture.mutable-module',
			version: '1.0.0',
		}
		const isolatedModule = definePluginModule(mutableFacts)
		mutableFacts.pluginId = 'fixture.mutated-after-definition'
		expect(isolatedModule.plugin({}).manifest.identity.pluginId).toBe(
			'fixture.mutable-module',
		)
	})

	it('keeps Core-owned module facts non-overridable at runtime', () => {
		const untypedPlugin = (options: unknown): unknown =>
			(fixtureModule.plugin as (input: unknown) => unknown)(options)

		expect(() => definePluginModule(null as never)).toThrow(
			'plugin module options must be a plain object',
		)
		expect(() => untypedPlugin(null)).toThrow(
			'plugin module definition must be a plain object',
		)
		expect(() => untypedPlugin({ pluginId: 'fixture.forged' })).toThrow(
			'cannot override package-owned pluginId',
		)
		expect(() =>
			definePluginModule({
				core: '^0.0.0',
				pluginId: 'fixture.invalid-module-option',
				version: '1.0.0',
				// @ts-expect-error -- Runtime validation protects JavaScript callers.
				extra: true,
			}),
		).toThrow('Unknown plugin module option')
	})

	it('delegates manifest ownership and conflicts to Core unchanged', () => {
		const definition = {
			conflicts: ['fixture.legacy-workflow'],
			instanceId: 'editorial',
			peers: [{ pluginId: 'fixture.protocol', version: '^1.0.0' }],
			privileges: [
				{
					name: 'runtime:observe' as const,
					reason: 'Records workflow timing.',
				},
			],
		} as const
		const fromModule = fixtureModule.plugin(definition)
		const fromCore = definePlugin({
			...definition,
			core: '^0.0.0',
			pluginId: 'fixture.plugin-kit',
			version: '1.2.3',
		})

		expect(fromModule.manifest).toStrictEqual(fromCore.manifest)
		expect(fromModule.conflicts).toStrictEqual(fromCore.conflicts)
		expect(fromModule.peers).toStrictEqual(fromCore.peers)
	})

	it('validates option roots once and freezes normalized results', () => {
		const parse = definePluginOptionsParser({
			keys: ['enabled', 'label'] as const,
			name: 'workflow options',
			normalize: ({ enabled, label }) => {
				if (enabled !== undefined && typeof enabled !== 'boolean') {
					throw new TypeError('workflow enabled must be a boolean')
				}
				if (label !== undefined && typeof label !== 'string') {
					throw new TypeError('workflow label must be a string')
				}

				return { enabled: enabled ?? true, label: label ?? 'review' }
			},
		})
		const input: { enabled?: boolean; label?: string } = { label: 'publish' }
		const normalized = parse(input)
		input.label = 'mutated'

		expect(normalized).toStrictEqual({ enabled: true, label: 'publish' })
		expect(Object.isFrozen(normalized)).toBe(true)
		expect(() => parse({ unknown: true })).toThrow(
			'Unknown workflow options key: unknown',
		)
		expect(() => parse(null)).toThrow('workflow options must be a plain object')

		const parseWithExistingDiagnostic = definePluginOptionsParser({
			formatUnknownKey: (key) => `Unsupported workflow option: ${String(key)}`,
			keys: [] as const,
			name: 'workflow options',
			normalize: () => ({}),
		})
		expect(() => parseWithExistingDiagnostic({ legacy: true })).toThrow(
			'Unsupported workflow option: legacy',
		)
	})

	it('rejects malformed parser definitions and normalized roots', () => {
		expect(() => definePluginOptionsParser(null as never)).toThrow(
			'plugin options parser definition must be a plain object',
		)
		const defineUntypedParser = definePluginOptionsParser as (
			definition: unknown,
		) => unknown
		expect(() =>
			defineUntypedParser({
				keys: [],
				name: 'unknown definition options',
				normalize: () => ({}),
				unknown: true,
			}),
		).toThrow('Unknown plugin options parser definition option: unknown')
		expect(() =>
			definePluginOptionsParser({
				keys: ['mode', 'mode'],
				name: 'duplicate options',
				normalize: () => ({}),
			}),
		).toThrow('Duplicate plugin option key: mode')
		expect(() =>
			definePluginOptionsParser({
				keys: [],
				name: 'invalid result options',
				normalize: () => null as never,
			})({}),
		).toThrow('invalid result options normalizer must return a plain object')
	})

	it('validates and transforms plugin options through Standard Schema', () => {
		const parse = definePluginOptionsParser({
			name: 'workflow options',
			schema: z.strictObject({
				instanceId: z.string().optional(),
				label: z.string().transform((value) => value.trim()),
				mode: z.enum(['review', 'publish']).default('review'),
			}),
		})
		const normalized = parse({ label: ' Editorial ' })

		expect(normalized).toStrictEqual({
			label: 'Editorial',
			mode: 'review',
		})
		expect(Object.isFrozen(normalized)).toBe(true)
	})

	it('leaves unknown-key behavior to the Standard Schema', () => {
		const stripUnknown = definePluginOptionsParser({
			name: 'permissive workflow options',
			schema: z.object({ enabled: z.boolean() }),
		})
		const rejectUnknown = definePluginOptionsParser({
			name: 'strict workflow options',
			schema: z.strictObject({ enabled: z.boolean() }),
		})
		const input = { enabled: true, ignored: 'schema-owned' }

		expect(stripUnknown(input)).toStrictEqual({ enabled: true })
		expect(() => rejectUnknown(input)).toThrow(
			'strict workflow options validation failed',
		)
	})

	it('retains Standard Schema issue paths in one focused error', () => {
		const parse = definePluginOptionsParser({
			name: 'workflow options',
			schema: z.strictObject({
				settings: z.strictObject({ retries: z.number().int() }),
			}),
		}) as (input: unknown) => Readonly<object>

		expect(() => parse({ settings: { retries: 'three' } })).toThrow(
			/workflow options validation failed: settings\.retries:/,
		)
	})

	it('rejects asynchronous schemas and non-object schema outputs', () => {
		const asyncSchema: StandardSchemaV1<unknown, { enabled: boolean }> = {
			'~standard': {
				validate: () => Promise.resolve({ value: { enabled: true } }),
				vendor: 'fixture',
				version: 1,
			},
		}
		const parseAsync = definePluginOptionsParser({
			name: 'async workflow options',
			schema: asyncSchema,
		})
		const defineUntypedParser = definePluginOptionsParser as (
			definition: unknown,
		) => (input: unknown) => Readonly<object>
		const parsePrimitive = defineUntypedParser({
			name: 'primitive workflow options',
			schema: z.string(),
		})

		expect(() => parseAsync({})).toThrow(
			'async workflow options schema validation must be synchronous',
		)
		expect(() => parsePrimitive('review')).toThrow(
			'primitive workflow options schema must return a plain object',
		)
	})

	it('rejects malformed or mixed Standard Schema definitions', () => {
		const defineUntypedParser = definePluginOptionsParser as (
			definition: unknown,
		) => unknown

		expect(() =>
			defineUntypedParser({ name: 'invalid options', schema: {} }),
		).toThrow('plugin options parser schema must implement Standard Schema V1')
		expect(() =>
			defineUntypedParser({
				keys: [],
				name: 'mixed options',
				normalize: () => ({}),
				schema: z.object({}),
			}),
		).toThrow('Unknown plugin options parser definition option: keys')
	})

	it('groups exact nominal Typegen references under one module', () => {
		const input = defineTypegenReference({
			exportName: 'PublishInput',
			module: '@fixture/workflow-plugin',
		})
		const result = defineTypegenReference({
			exportName: 'PublishResult',
			module: '@fixture/workflow-plugin',
		})

		expect(input).toMatchObject({
			exportName: 'PublishInput',
			module: '@fixture/workflow-plugin',
		})
		expect(result).toMatchObject({
			exportName: 'PublishResult',
			module: '@fixture/workflow-plugin',
		})
		expect(Object.isFrozen(input)).toBe(true)
	})

	it('builds immutable additive schema patches accepted by Core', () => {
		const workflowOption = defineSchemaOption<(value: string) => string>({
			normalize: (value, path) => {
				if (typeof value !== 'function') {
					throw new TypeError(`${path} must be a function`)
				}
				return value as (value: string) => string
			},
			protocolVersion: 1,
			typegen: {
				module: '@fixture/plugin-kit',
				type: 'WorkflowOption',
			},
			valueKind: 'opaque',
		})
		const Target = Schema.define({
			className: 'PluginKitPatchTarget',
			fields: (field) => ({ title: field.string() }),
			workflow: (value: string) => value,
		} as SchemaOptions<'PluginKitPatchTarget'> & {
			readonly workflow: (value: string) => string
		})
		const constraint = defineSchemaConstraint({
			kind: 'fixture.workflow',
			value: { required: true },
			version: 1,
		})
		const empty = schemaPatch()
		const patch = empty
			.addField({
				contributionId: 'workflow-state',
				field: stringField(),
				name: 'workflowState',
			})
			.addIndex({
				contributionId: 'workflow-state-index',
				fields: ['workflowState', 'createdAt'],
			})
			.addConstraint({ contributionId: 'workflow-constraint', constraint })
			.setSchemaOption({
				contributionId: 'workflow-option',
				name: 'workflow',
				value: { enabled: true },
			})
			.setFieldOption({
				contributionId: 'workflow-field-option',
				field: 'title',
				name: 'search',
				value: { weight: 10 },
			})

		expect(empty.operations).toStrictEqual([])
		expect(patch.operations.map(({ kind }) => kind)).toStrictEqual([
			'field:add',
			'index:add',
			'constraint:add',
			'schema-option:set',
			'field-option:set',
		])
		expect(Object.isFrozen(patch)).toBe(true)

		const plugin = fixtureModule.plugin({
			declare: ({ schemas }) => {
				schemas.defineOptions({
					contributionId: 'workflow-options',
					schema: { workflow: workflowOption },
				})
				schemas.patch(
					patchSchemas({
						patch: schemaPatch()
							.addField({
								contributionId: 'state',
								field: stringField(),
								name: 'state',
							})
							.addIndex({
								contributionId: 'state-index',
								fields: ['state', 'createdAt'],
							}),
						targets: schemas.select({
							option: { name: 'workflow' },
						}),
					}),
				)
			},
			privileges: [
				{ name: 'schema:declare', reason: 'Adds fixture schema metadata.' },
			] as const,
		})
		const application = new FrameworkApplication({
			pluginPrivileges: { logger: false },
			plugins: [plugin],
			schemas: [Target],
		})

		application.compileSchemas()
		expect(Target.definition.fields).toHaveProperty('state')
		expect(Target.definition.indexes).toContainEqual({
			fields: ['state', 'createdAt'],
			unique: false,
		})
	})

	it('materializes and disposes resource-backed operation handlers', async () => {
		const text = defineOperationValue((value, path): string => {
			if (typeof value !== 'string') throw new TypeError(`${path} must be text`)
			return value
		})
		const inspect = defineOperation({
			input: text,
			name: 'fixture.plugin-kit.inspect',
			result: text,
			target: 'application',
			transaction: 'forbidden',
			version: '1.0.0',
		})
		const trace: string[] = []
		const providerOptions: {
			create: ResourcePluginOperationContributionOptions<
				typeof inspect,
				readonly []
			>['create']
			operation: typeof inspect
		} = {
			create: () => {
				trace.push('create')
				return {
					dispose: () => {
						trace.push('dispose')
					},
					execute: ({ input }) => input,
				}
			},
			operation: inspect,
		}
		const provider = contributeOperation(providerOptions)
		providerOptions.create = () => {
			trace.push('mutated-create')
			return { execute: ({ input }) => input }
		}
		const plugin = fixtureModule.plugin({
			operations: [provider],
			privileges: [
				{
					name: 'operation:declare',
					reason: 'Declares the fixture operation.',
				},
			] as const,
		})
		const application = new FrameworkApplication({
			pluginPrivileges: { logger: false },
			plugins: [plugin],
			schemas: [],
		})

		await application.initialize()
		expect(trace).toStrictEqual(['create'])
		await application.dispose()
		expect(trace).toStrictEqual(['create', 'dispose'])
	})

	it('materializes direct operation handlers and rejects malformed wrappers', async () => {
		const text = defineOperationValue((value): string => String(value))
		const echo = defineOperation({
			input: text,
			name: 'fixture.plugin-kit.echo',
			result: text,
			target: 'application',
			transaction: 'forbidden',
			version: '1.0.0',
		})
		const provider = contributeOperation({
			execute: ({ input }) => input,
			operation: echo,
		})
		const plugin = fixtureModule.plugin({
			operations: [provider],
			privileges: [
				{ name: 'operation:declare', reason: 'Declares the echo operation.' },
			] as const,
		})
		const application = new FrameworkApplication({
			pluginPrivileges: { logger: false },
			plugins: [plugin],
			schemas: [],
		})

		await application.initialize()
		await application.dispose()
		expect(Object.isFrozen(provider)).toBe(true)

		const callUntyped = contributeOperation as (options: unknown) => unknown
		expect(() => callUntyped(null)).toThrow(
			'plugin operation contribution must be a plain object',
		)
		expect(() => callUntyped({ operation: echo })).toThrow(
			'plugin operation contribution requires exactly one of create or execute',
		)
		expect(() =>
			callUntyped({
				execute: () => undefined,
				operation: {},
			}),
		).toThrow('plugin operation contribution requires an operation')
	})

	it('rejects schema bindings that could bypass the nominal builder', () => {
		const bindUntyped = patchSchemas as (options: unknown) => unknown

		expect(() => bindUntyped(null)).toThrow(
			'schema patch binding must be a plain object',
		)
		expect(() =>
			bindUntyped({
				patch: { operations: [] },
				targets: { kind: 'all' },
			}),
		).toThrow('schema patch must be created by schemaPatch')
		expect(() =>
			bindUntyped({
				extra: true,
				patch: schemaPatch(),
				targets: { kind: 'all' },
			}),
		).toThrow('Unknown schema patch binding option: extra')
	})
})
