import { immutableArray, immutableRecord } from '@ultimabase/shared'
import { describe, expect, it } from 'vitest'

import { FrameworkApplication } from '../../application/framework-application.js'
import { Schema } from '../../schema/schema/definition.js'
import { stringField } from '../../schema/fields/builtins/string.js'
import {
	decorateCapability,
	defineCapability,
	replaceCapability,
	type CapabilityContributionTarget,
} from '../capabilities.js'
import { definePlugin } from '../definition.js'
import { addSchemaField } from '../schema-field-patch-operations.js'
import {
	canonicalSchemaCompilerTarget,
	replaceSchemaCompiler,
	schemaCompilerCapability,
	type SchemaCompilerImplementation,
} from './schema-compiler-capability.js'

const identityCompiler: SchemaCompilerImplementation = (input) =>
	immutableRecord({
		protocolVersion: input.protocolVersion,
		selections: immutableArray(
			input.declarations.flatMap(({ selections }) =>
				selections.map(({ selectionId }) =>
					immutableRecord({ classNames: immutableArray([]), selectionId }),
				),
			),
		),
		schemas: immutableArray([
			...input.schemas,
			...input.declarations.flatMap(({ additions }) =>
				additions.map(({ schema }) => schema),
			),
		]),
	})

const compilerPlugin = (
	pluginId: string,
	contributionId: string,
	compile: SchemaCompilerImplementation = identityCompiler,
	options?: Readonly<{
		readonly instanceId?: string
		readonly target?: CapabilityContributionTarget
	}>,
) =>
	definePlugin({
		core: '^0.0.0',
		pluginId,
		...(options?.instanceId === undefined
			? {}
			: { instanceId: options.instanceId }),
		privileges: [
			{
				name: 'schema:replace',
				reason: 'Exercises complete schema compiler replacement.',
			},
		] as const,
		version: '2.3.4',
		capabilities: {
			replaces: [
				replaceSchemaCompiler({
					compile,
					contributionId,
					staticOptions: { engine: 'fixture', revision: 2 },
					...(options?.target === undefined ? {} : { target: options.target }),
				}),
			],
		},
	})

describe('schema compiler replacement capability', () => {
	it('selects one complete compiler without running the canonical compiler first', () => {
		let compileCalls = 0
		const Target = Schema.define({
			className: 'ReplacementTarget',
			fields: (field) => ({ title: field.string() }),
		})
		const replacement = compilerPlugin(
			'fixture.schema-compiler',
			'complete-compiler',
			(input) => {
				compileCalls += 1
				return identityCompiler(input)
			},
		)
		const patch = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.schema-patch',
			privileges: [
				{
					name: 'schema:declare',
					reason: 'Proves canonical patches do not run.',
				},
			] as const,
			version: '1.0.0',
			declare: ({ schemas }) => {
				schemas.patch({
					operations: [
						addSchemaField({
							contributionId: 'canonical-only-field',
							field: stringField(),
							name: 'canonicalOnly',
						}),
					],
					targets: schemas.select({ className: Target.className }),
				})
			},
		})
		const application = new FrameworkApplication({
			pluginPrivileges: { logger: false },
			plugins: [replacement, patch],
			schemas: [Target],
		})

		expect(application.schemaCompilerProvenance).toStrictEqual({
			capabilityId: 'ultimabase.schema-compiler',
			capabilityVersion: '2.0.0',
			contributionId: 'complete-compiler',
			normalizedStaticOptions: { engine: 'fixture', revision: 2 },
			owner: {
				kind: 'plugin',
				pluginId: 'fixture.schema-compiler',
				version: '2.3.4',
			},
			protocolVersion: '2.0.0',
			target: canonicalSchemaCompilerTarget,
		})
		expect(Object.isFrozen(application.schemaCompilerProvenance)).toBe(true)
		expect(application.compileSchemas()).toBe(application)
		expect(application.compileSchemas()).toBe(application)
		expect(compileCalls).toBe(1)
		expect(Target.fields).not.toHaveProperty('canonicalOnly')
		expect(Target.fields).toHaveProperty('id')
	})

	it('keeps the canonical provider and its provenance when no plugin replaces it', () => {
		const application = new FrameworkApplication({
			pluginPrivileges: { logger: false },
			plugins: [],
			schemas: [],
		})

		expect(application.schemaCompilerProvenance).toStrictEqual({
			capabilityId: 'ultimabase.schema-compiler',
			capabilityVersion: '2.0.0',
			contributionId: 'canonical-schema-compiler',
			normalizedStaticOptions: {},
			owner: { kind: 'core', version: '0.0.0' },
			protocolVersion: '2.0.0',
		})
	})

	it('requires the dedicated factory and exact schema replacement privilege', () => {
		const generic = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.generic-schema-compiler',
			privileges: [
				{
					name: 'schema:replace',
					reason: 'Must not authorize a generic factory.',
				},
				{
					name: 'capability:replace',
					reason: 'Must not substitute for the dedicated schema boundary.',
				},
			] as const,
			version: '1.0.0',
			capabilities: {
				replaces: [
					replaceCapability(schemaCompilerCapability, {
						contributionId: 'generic',
						target: canonicalSchemaCompilerTarget,
						value: {
							kind: 'schema-compiler-provider',
							protocolVersion: '2.0.0',
							staticOptions: {},
						},
					}),
				],
			},
		})

		expect(
			() =>
				new FrameworkApplication({
					pluginPrivileges: { logger: false },
					plugins: [generic],
					schemas: [],
				}),
		).toThrow('must be created by replaceSchemaCompiler')

		const noPrivilege = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.unprivileged-schema-compiler',
			version: '1.0.0',
			capabilities: {
				replaces: [
					replaceSchemaCompiler({
						compile: identityCompiler,
						contributionId: 'unprivileged',
					}),
				],
			},
		})

		expect(
			() =>
				new FrameworkApplication({
					pluginPrivileges: { logger: false },
					plugins: [noPrivilege],
					schemas: [],
				}),
		).toThrow('must declare active privilege "schema:replace"')
	})

	it('forbids decoration and rejects mutable or partial output before setup', () => {
		const decorator = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.schema-compiler-decorator',
			privileges: [
				{
					name: 'capability:decorate',
					reason: 'Proves the exceptional capability is not a pipeline.',
				},
			] as const,
			version: '1.0.0',
			capabilities: {
				decorates: [
					decorateCapability(schemaCompilerCapability, {
						contributionId: 'forbidden-decorator',
						decorate: (compiler) => compiler,
					}),
				],
			},
		})
		expect(
			() =>
				new FrameworkApplication({
					pluginPrivileges: { logger: false },
					plugins: [decorator],
					schemas: [],
				}),
		).toThrow('Schema compiler capability cannot be decorated')

		const Target = Schema.define({
			className: 'MalformedReplacementTarget',
			fields: () => ({}),
		})
		const malformed = compilerPlugin(
			'fixture.malformed-schema-compiler',
			'malformed',
			(input) => ({
				protocolVersion: input.protocolVersion,
				selections: [],
				schemas: [],
			}),
		)
		let setupCalls = 0
		const setup = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.setup-after-compiler',
			version: '1.0.0',
			setup: () => {
				setupCalls += 1
			},
		})
		const application = new FrameworkApplication({
			pluginPrivileges: { logger: false },
			plugins: [malformed, setup],
			schemas: [Target],
		})

		expect(() => application.compileSchemas()).toThrow(
			'schema compiler output must be immutable',
		)
		expect(() => application.compileSchemas()).toThrow(
			'schema compiler output must be immutable',
		)
		expect(setupCalls).toBe(0)
	})

	it('selects the last exact replacement in an explicit-instance chain', () => {
		let firstCalls = 0
		let secondCalls = 0
		const first = compilerPlugin(
			'fixture.instance-compiler',
			'first',
			(input) => {
				firstCalls += 1
				return identityCompiler(input)
			},
			{ instanceId: 'first' },
		)
		const firstTarget = immutableRecord({
			contributionId: 'first',
			owner: immutableRecord({
				instanceId: 'first',
				pluginId: 'fixture.instance-compiler',
			}),
		})
		const second = compilerPlugin(
			'fixture.instance-compiler',
			'second',
			(input) => {
				secondCalls += 1
				return identityCompiler(input)
			},
			{ instanceId: 'second', target: firstTarget },
		)
		const application = new FrameworkApplication({
			pluginPrivileges: { logger: false },
			plugins: [second, first],
			schemas: [],
		})

		application.compileSchemas()

		expect(firstCalls).toBe(0)
		expect(secondCalls).toBe(1)
		expect(application.schemaCompilerProvenance).toMatchObject({
			contributionId: 'second',
			owner: {
				instanceId: 'second',
				kind: 'plugin',
				pluginId: 'fixture.instance-compiler',
				version: '2.3.4',
			},
			target: firstTarget,
		})
	})

	it('fails stale targets, competing replacements, and detached cycles deterministically', () => {
		const stale = compilerPlugin(
			'fixture.stale-compiler',
			'stale',
			identityCompiler,
			{
				target: immutableRecord({
					contributionId: 'missing',
					owner: immutableRecord({ pluginId: 'fixture.missing-compiler' }),
				}),
			},
		)
		expect(
			() =>
				new FrameworkApplication({
					pluginPrivileges: { logger: false },
					plugins: [stale],
					schemas: [],
				}),
		).toThrow('targets a missing contribution')

		const branchA = compilerPlugin('fixture.branch-a', 'branch-a')
		const branchB = compilerPlugin('fixture.branch-b', 'branch-b')
		expect(
			() =>
				new FrameworkApplication({
					pluginPrivileges: { logger: false },
					plugins: [branchA, branchB],
					schemas: [],
				}),
		).toThrow('has more than one direct replacement')

		const cycleA = compilerPlugin(
			'fixture.cycle-a',
			'cycle-a',
			identityCompiler,
			{
				target: immutableRecord({
					contributionId: 'cycle-b',
					owner: immutableRecord({ pluginId: 'fixture.cycle-b' }),
				}),
			},
		)
		const cycleB = compilerPlugin(
			'fixture.cycle-b',
			'cycle-b',
			identityCompiler,
			{
				target: immutableRecord({
					contributionId: 'cycle-a',
					owner: immutableRecord({ pluginId: 'fixture.cycle-a' }),
				}),
			},
		)
		expect(
			() =>
				new FrameworkApplication({
					pluginPrivileges: { logger: false },
					plugins: [cycleA, cycleB],
					schemas: [],
				}),
		).toThrow('contains a replacement cycle')
	})

	it('rejects a replacement declared through an incompatible capability version', () => {
		const incompatibleToken = defineCapability<{
			readonly kind: 'schema-compiler-provider'
			readonly protocolVersion: '2.0.0'
			readonly staticOptions: Readonly<Record<string, never>>
		}>()({
			capabilityId: 'ultimabase.schema-compiler',
			version: '3.0.0',
			cardinality: 'single',
			lifetime: 'declaration',
			compose: ([provider]) => provider,
		})
		const incompatible = definePlugin({
			core: '^0.0.0',
			pluginId: 'fixture.incompatible-schema-compiler',
			privileges: [
				{
					name: 'capability:replace',
					reason: 'Exercises deterministic protocol mismatch reporting.',
				},
			] as const,
			version: '1.0.0',
			capabilities: {
				replaces: [
					replaceCapability(incompatibleToken, {
						contributionId: 'incompatible',
						target: canonicalSchemaCompilerTarget,
						value: {
							kind: 'schema-compiler-provider',
							protocolVersion: '2.0.0',
							staticOptions: {},
						},
					}),
				],
			},
		})

		expect(
			() =>
				new FrameworkApplication({
					pluginPrivileges: { logger: false },
					plugins: [incompatible],
					schemas: [],
				}),
		).toThrow(
			'uses "ultimabase.schema-compiler@3.0.0" but its target contributes "ultimabase.schema-compiler@2.0.0"',
		)
	})

	it('keeps compiler inputs isolated across applications', () => {
		const compiledClassNames: string[][] = []
		const replacement = compilerPlugin(
			'fixture.isolated-compiler',
			'isolated',
			(input) => {
				compiledClassNames.push(input.schemas.map(({ className }) => className))
				return identityCompiler(input)
			},
		)
		const First = Schema.define({
			className: 'CompilerIsolationFirst',
			fields: () => ({}),
		})
		const Second = Schema.define({
			className: 'CompilerIsolationSecond',
			fields: () => ({}),
		})
		const first = new FrameworkApplication({
			pluginPrivileges: { logger: false },
			plugins: [replacement],
			schemas: [First],
		})
		const second = new FrameworkApplication({
			pluginPrivileges: { logger: false },
			plugins: [replacement],
			schemas: [Second],
		})

		first.compileSchemas()
		second.compileSchemas()

		expect(compiledClassNames).toStrictEqual([
			['CompilerIsolationFirst'],
			['CompilerIsolationSecond'],
		])
	})

	it('rejects removal of protected Core fields and inconsistent provenance', () => {
		const Target = Schema.define({
			className: 'ProtectedCompilerTarget',
			fields: (field) => ({ title: field.string() }),
		})
		const withoutId = compilerPlugin(
			'fixture.core-field-removal-compiler',
			'core-field-removal',
			(input) =>
				immutableRecord({
					protocolVersion: input.protocolVersion,
					selections: immutableArray([]),
					schemas: immutableArray(
						input.schemas.map((schema) =>
							immutableRecord({
								...schema,
								fields: immutableArray(
									schema.fields.filter(({ name }) => name !== 'id'),
								),
								provenance: immutableRecord({
									...schema.provenance,
									fields: immutableRecord(
										Object.fromEntries(
											Object.entries(schema.provenance.fields).filter(
												([name]) => name !== 'id',
											),
										),
									),
								}),
							}),
						),
					),
				}),
		)
		const protectedApplication = new FrameworkApplication({
			pluginPrivileges: { logger: false },
			plugins: [withoutId],
			schemas: [Target],
		})
		expect(() => protectedApplication.compileSchemas()).toThrow(
			'changed protected Core field: ProtectedCompilerTarget.id',
		)

		const inconsistent = compilerPlugin(
			'fixture.inconsistent-provenance-compiler',
			'inconsistent-provenance',
			(input) => {
				const [schema] = input.schemas
				if (schema === undefined) return identityCompiler(input)
				return immutableRecord({
					protocolVersion: input.protocolVersion,
					selections: immutableArray([]),
					schemas: immutableArray([
						immutableRecord({
							...schema,
							provenance: immutableRecord({
								...schema.provenance,
								fields: immutableRecord({}),
							}),
						}),
					]),
				})
			},
		)
		const InconsistentTarget = Schema.define({
			className: 'InconsistentCompilerTarget',
			fields: () => ({}),
		})
		const inconsistentApplication = new FrameworkApplication({
			pluginPrivileges: { logger: false },
			plugins: [inconsistent],
			schemas: [InconsistentTarget],
		})
		expect(() => inconsistentApplication.compileSchemas()).toThrow(
			'provenance.fields must match schema fields',
		)
	})
})
