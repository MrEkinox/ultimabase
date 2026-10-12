import { UltimaBase, stringField } from '@ultimabase/core'
import {
	contributeDeclarations,
	contributeOperation,
	defineOperation,
	defineOperationValue,
	plugin,
	defineSchemaOption,
	defineTypegenReference,
	type ResourcePluginOperationContributionOptions,
} from '@ultimabase/core/plugin'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import {
	defineOutputDescriptor,
	definePluginFieldOption,
	definePluginOptionsParser,
	patchSchemas,
	schemaPatch,
} from './index.js'

describe('plugin authoring helpers', () => {
	it('preserves Core provenance for contextual field helpers', () => {
		const output = defineOutputDescriptor(
			'fixture.label-output',
			{ list: false, nullable: false },
			(value) => String(value),
		)
		const option = definePluginFieldOption({
			contexts: ['stored'],
			normalize: (value) => String(value),
			protocolVersion: 1,
			typegen: false,
		})
		const definition = plugin({
			id: 'fixture.plugin-kit',
			version: '1.2.3',
			core: '^0.0.0',
			contributions: [
				contributeDeclarations({
					schema: ({ schemas }) => {
						schemas.defineOptions({
							contributionId: 'label-option',
							field: { label: option },
						})
						return undefined
					},
				}),
			],
			permissions: {
				'schema:declare': 'Declares contextual fixtures.',
			},
		})

		expect(() =>
			new (UltimaBase.use(definition))({
				schemas: [],
			}).compile(),
		).not.toThrow()
		expect(output).toStrictEqual({
			kind: 'fixture.label-output',
			options: { list: false, nullable: false },
		})
		expect(Object.isFrozen(output.options)).toBe(true)
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
			'schema-option:set',
			'field-option:set',
		])
		expect(Object.isFrozen(patch)).toBe(true)

		const definition = plugin({
			id: 'fixture.plugin-kit',
			version: '1.2.3',
			core: '^0.0.0',
			contributions: [
				contributeDeclarations({
					schema: ({ schemas }) => {
						const options = schemas.defineOptions({
							contributionId: 'workflow-options',
							schema: { workflow: workflowOption },
						})
						const patch = schemas.patch(
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
						return [options, patch]
					},
				}),
			],
			permissions: {
				'schema:declare': 'Adds fixture schema metadata.',
			},
		})
		const Application = UltimaBase.use(definition)
		const Target = Application.Schema.define({
			className: 'PluginKitPatchTarget',
			fields: (field) => ({ title: field.string() }),
		}).with({
			workflow: (value: string) => value,
		})
		const application = new Application({
			logger: false,
			schemas: [Target],
		})

		application.compile()
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
		const definition = plugin({
			id: 'fixture.plugin-kit',
			version: '1.2.3',
			core: '^0.0.0',
			contributions: [provider],
			permissions: {
				'operation:declare': 'Declares the fixture operation.',
			},
		})
		const application = new (UltimaBase.use(definition))({
			logger: false,
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
		const definition = plugin({
			id: 'fixture.plugin-kit',
			version: '1.2.3',
			core: '^0.0.0',
			contributions: [provider],
			permissions: {
				'operation:declare': 'Declares the echo operation.',
			},
		})
		const application = new (UltimaBase.use(definition))({
			logger: false,
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
