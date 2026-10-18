import { immutableRecord, isPlainRecord } from '@ultimabase/shared'
import { describe, expect, it, onTestFinished } from 'vitest'

import { provideTestDatabaseAdapter } from '../../../tests/runtime/fixtures/database-adapter-capability.js'
import { RecordingDatabaseAdapter } from '../../../tests/runtime/fixtures/recording-database-adapter.js'
import type { Logger } from '../../application/application-log.js'
import { createApplication } from '../../application/framework-application.js'
import {
	defineCapability,
	provideCapability,
	requireCapability,
} from '../../plugins/capabilities.js'
import { type ApplicationCallbackExecutor } from '../../plugins/callback-execution.js'
import type { PluginDefinition } from '../../plugins/definition.js'
import { normalizeExposureRule } from '../../plugins/exposure-rules.js'
import { type PluginIdentity } from '../../plugins/manifest.js'
import {
	contributeOperation,
	contributeSchemaMutation,
} from '../../plugins/plugin-command-contributions.js'
import {
	contributeDeclarations,
	withPluginPrivileges,
} from '../../plugins/plugin-contributions.js'
import {
	defineOperation,
	defineOperationValue,
} from '../../plugins/plugin-operations.js'
import { defineSchemaMutation } from '../../plugins/plugin-schema-mutations.js'
import { plugin as createPlugin } from '../../plugins/plugin.js'
import { closeSchemaCommand } from '../../plugins/schema-field-patch-operations.js'
import { defineSchemaOption } from '../../plugins/schema-option-definitions.js'
import {
	provideSchemaRules,
	type PluginInstance,
	type PluginSchemaRulesSource,
	type SchemaRulesHKT,
} from '../../plugin.js'
import { Schema, type SchemaDefinition } from '../../schema/schema/definition.js'
import { defineOperationTransport } from '../plugin-operations/capabilities.js'
import {
	schemaMutationTransportBinding,
	schemaMutationWireCodec,
} from '../schema-mutations/transport-capabilities.js'
import {
	applicationOperationTransportPlanningCapability,
	type ApplicationExposurePlan,
	type ApplicationOperationTransportPlanner,
	type ExposurePlanningOptions,
} from './application-operation-transport-planning.js'
import { UltimaBase } from './ultima-base.js'

// ADR-0347 decision 3 and amendment items 1-3: one exposure plan per
// protocol, compiled by Core from `expose`, the transport's own key and its
// `default`.
const protocol = defineOperationTransport({
	name: 'fixture.exposure-planning.wire',
	version: '1.0.0',
})
const anyInput = defineOperationValue((value) => value)
const mutation = (
	name: string,
	authority: 'master' | 'request',
	target: 'many' | 'one',
) =>
	defineSchemaMutation({
		authority,
		effect: 'update',
		input: anyInput,
		name: `fixture.exposure-planning.${name}`,
		returning: 'after',
		target,
		version: '1.0.0',
	})
const archive = mutation('archive', 'request', 'one')
const purge = mutation('purge', 'master', 'one')
const shout = mutation('shout', 'request', 'many')
// A Master command stays unexposed even when its owner binds it.
const purgeBinding = schemaMutationTransportBinding({
	codec: schemaMutationWireCodec({
		decode: (value: unknown) => value,
		mutation: purge,
		transport: protocol,
	}),
	metadata: null,
	mutation: purge,
})
const message = defineOperationValue((value, path) => {
	if (!isPlainRecord(value) || typeof value.message !== 'string') {
		throw new TypeError(`${path}.message must be a string`)
	}
	return immutableRecord({ message: value.message })
})
const operation = (name: string) =>
	defineOperation({
		input: message,
		name: `fixture.exposure-planning.${name}`,
		result: message,
		target: 'application',
		transaction: 'optional',
		version: '1.0.0',
	})
const echo = operation('echo')
const ping = operation('ping')
const internal = operation('internal')

/** Adds the three commands to every named schema, and two public operations. */
const commandsPlugin = (classNames: readonly string[]) =>
	createPlugin({
		id: 'fixture.exposure-planning.commands',
		core: '^0.0.0',
		version: '1.0.0',
		permissions: {
			'model:extend': 'Attaches the commands.',
			'operation:declare': 'Declares the commands.',
			'persistence:rewrite': 'Persists the commands.',
			'transport:expose': 'Binds purge.',
		},
		contributions: [
			contributeSchemaMutation({ mutation: archive, resolve: () => ({}) }),
			contributeSchemaMutation({
				bindings: [purgeBinding],
				mutation: purge,
				resolve: () => ({}),
			}),
			contributeSchemaMutation({ mutation: shout, resolve: () => ({}) }),
			contributeOperation({
				execute: ({ input }) => input,
				operation: echo,
				public: { name: 'echo' },
			}),
			contributeOperation({
				execute: ({ input }) => input,
				operation: ping,
				public: { name: 'ping' },
			}),
			// Not public: no transport lists it.
			contributeOperation({
				execute: ({ input }) => input,
				operation: internal,
			}),
			contributeDeclarations({
				models: ({ models }) => {
					for (const className of classNames) {
						models.extend(
							{ className },
							{
								contributionId: `commands-${className}`,
								schemaMutations: {
									archiveOne: { mutation: archive, surfaces: ['schema'] },
									purgeOne: { mutation: purge, surfaces: ['schema'] },
									shoutMany: { mutation: shout, surfaces: ['schema'] },
								},
							},
						)
					}
				},
			}),
		],
	})

const closureReason = 'Entries are created by the ledger.'
const closurePlugin = (className: string) =>
	createPlugin({
		core: '^0.0.0',
		id: 'fixture.exposure-planning.closure',
		permissions: { 'schema:declare': 'Closes creation.' },
		version: '1.0.0',
		contributions: [
			contributeDeclarations({
				schema: ({ schemas }) => {
					schemas.patch({
						operations: [
							closeSchemaCommand({
								command: 'create',
								contributionId: 'creation',
								reason: closureReason,
							}),
						],
						targets: schemas.select({ className }),
					})
					return undefined
				},
			}),
		],
	})

interface WireRules extends SchemaRulesHKT {
	readonly rules: Readonly<{
		wire?: boolean | Readonly<Record<string, boolean>>
	}>
}

type WirePlugin = PluginInstance<{
	readonly core: '^0.0.0'
	readonly id: 'fixture.exposure-planning.wire'
	readonly source: PluginSchemaRulesSource<WireRules>
	readonly version: '1.0.0'
}>

interface Harness {
	callbacks?: ApplicationCallbackExecutor
	owner?: PluginIdentity
	planner?: ApplicationOperationTransportPlanner
}

const planningRequirement = requireCapability(
	applicationOperationTransportPlanningCapability,
	'^1.0.0',
)
const harnessCapability = (id: string) =>
	defineCapability<Readonly<{ readonly ready: true }>>()({
		capabilityId: `${id}.harness`,
		cardinality: 'single',
		compose: ([provider]) => provider,
		lifetime: 'application',
		version: '1.0.0',
	})
const harnessContribution = (id: string, harness: Harness) =>
	withPluginPrivileges(
		provideCapability(harnessCapability(id), {
			contributionId: 'harness',
			create: ({ callbacks, capabilities, owner }) => {
				harness.callbacks = callbacks
				harness.owner = owner
				harness.planner = capabilities.get(planningRequirement)
				return { value: immutableRecord({ ready: true as const }) }
			},
		}),
		['transport:expose'],
	)

// The fixture transport owns the `wire` key of `.with`, as REST owns `rest`.
const wireHarness: Harness = {}
const wireInstance: WirePlugin = createPlugin({
	core: '^0.0.0',
	id: 'fixture.exposure-planning.wire',
	permissions: {
		'schema:declare': 'Declares the wire rule.',
		'transport:expose': 'Plans the wire transport.',
	},
	version: '1.0.0',
	contributions: [
		contributeDeclarations({
			schema: ({ schemas }) => {
				schemas.defineOptions({
					contributionId: 'wire',
					schema: {
						wire: defineSchemaOption({
							normalize: (value: unknown, path: string) =>
								normalizeExposureRule(value, path),
							protocolVersion: 1,
						}),
					},
				})
				return undefined
			},
		}),
		harnessContribution('fixture.exposure-planning.wire', wireHarness),
		planningRequirement,
	],
})
const wirePlugin = provideSchemaRules<WirePlugin>(wireInstance, ['wire'])

// A second transport that does not own `wire`.
const foreignHarness: Harness = {}
const foreignPlugin = createPlugin({
	core: '^0.0.0',
	id: 'fixture.exposure-planning.foreign',
	permissions: { 'transport:expose': 'Plans another transport.' },
	version: '1.0.0',
	contributions: [
		harnessContribution('fixture.exposure-planning.foreign', foreignHarness),
		planningRequirement,
	],
})

const RuleApp = UltimaBase.use(wirePlugin)

/** Declares one schema whose `.with` rules are given raw, plugin keys included. */
const declare = (
	className: string,
	rules: Readonly<Record<string, unknown>>,
): SchemaDefinition => {
	const declared = RuleApp.Schema.define({
		className,
		fields: (field) => ({ title: field.string() }),
	})
	const withMethod: unknown = Reflect.get(declared, 'with')
	const schema: unknown =
		typeof withMethod === 'function'
			? Reflect.apply(withMethod, declared, [rules])
			: undefined
	if (!Schema.is(schema)) throw new TypeError(`${className} is not a schema`)
	return schema
}

const setup = async (
	schemas: readonly SchemaDefinition[],
	plugins: readonly PluginDefinition[] = [],
) => {
	const application = await createApplication({
		logger: false,
		plugins: [
			commandsPlugin(schemas.map(({ className }) => className)),
			wirePlugin,
			...plugins,
		],
		schemas,
	})
	onTestFinished(() => application.dispose())
	return application
}

type PlanInput = Partial<ExposurePlanningOptions<typeof protocol>>

const planWith = (
	harness: Harness,
	input: PlanInput = {},
): ApplicationExposurePlan<typeof protocol> => {
	const { callbacks, owner, planner } = harness
	if (
		callbacks === undefined ||
		owner === undefined ||
		planner === undefined
	) {
		throw new TypeError('Exposure planning harness is unavailable')
	}
	return callbacks.runPlugin(owner, () =>
		planner.planExposure({
			factory: 'wirePlugin',
			label: 'Wire',
			schemaKey: 'wire',
			transport: protocol,
			...input,
		}),
	)
}
const plan = (input: PlanInput = {}) => planWith(wireHarness, input)

const methodsOf = (
	exposure: ApplicationExposurePlan,
	className: string,
): readonly string[] | undefined =>
	exposure.schemas
		.find((schema) => schema.className === className)
		?.methods.map(({ entry }) => entry.method)

const defaults = [
	'findMany',
	'findOne',
	'exists',
	'createOne',
	'updateOne',
	'deleteOne',
]
const reads = ['findMany', 'findOne', 'count', 'exists']
const writes = [
	'createOne',
	'createMany',
	'updateOne',
	'updateMany',
	'upsertOne',
	'upsertMany',
	'deleteOne',
	'deleteMany',
]

describe('exposure plan resolution (ADR-0347)', () => {
	it('serves the built-in defaults and keeps plugin commands closed', async () => {
		await setup([declare('ExposurePlainDocument', {})])

		expect(methodsOf(plan(), 'ExposurePlainDocument')).toEqual(defaults)
	})

	it('resolves the transport key, then expose, then the default, then built-in', async () => {
		const schemas = [
			declare('ExposureEmpty', {}),
			// The transport exception wins although it is less precise.
			declare('ExposureException', {
				expose: { count: true },
				wire: { read: false },
			}),
			declare('ExposureGroups', { expose: { write: false, create: true } }),
			declare('ExposureAll', { expose: true }),
			declare('ExposureHidden', { expose: true, wire: false }),
			declare('ExposureOperation', { expose: { archive: true } }),
			declare('ExposureWrites', { expose: { write: true } }),
			declare('ExposureReads', { expose: { read: true } }),
			declare('ExposurePrecise', {
				expose: { find: false },
				wire: { findOne: true },
			}),
		]
		await setup(schemas)
		const exposure = plan({ default: { count: true, deleteOne: false } })

		expect(
			Object.fromEntries(
				schemas.map(({ className }) => [
					className,
					methodsOf(exposure, className),
				]),
			),
		).toStrictEqual({
			ExposureEmpty: [...reads, 'createOne', 'updateOne'],
			ExposureException: ['createOne', 'updateOne'],
			ExposureGroups: [...reads, 'createOne', 'createMany'],
			ExposureAll: [...reads, ...writes, 'archiveOne'],
			ExposureHidden: undefined,
			ExposureOperation: [...reads, 'createOne', 'updateOne', 'archiveOne'],
			ExposureWrites: [...reads, ...writes, 'archiveOne'],
			ExposureReads: [...reads, 'createOne', 'updateOne'],
			ExposurePrecise: ['findOne', 'count', 'exists', 'createOne', 'updateOne'],
		})
	})

	it('describes each method with its catalog entry and plugin binding', async () => {
		await setup([declare('ExposureDescribed', { expose: { archive: true } })])
		const exposure = plan()
		const [schema] = exposure.schemas

		expect(schema?.methods[0]).toStrictEqual({
			entry: expect.objectContaining({
				kind: 'native',
				method: 'findMany',
				operation: 'find',
				group: 'read',
			}),
			kind: 'native',
		})
		expect(schema?.methods.at(-1)).toMatchObject({
			binding: {
				authority: 'request',
				bound: false,
				command: 'archiveOne',
				mutation: archive.name,
				schema: 'ExposureDescribed',
			},
			entry: {
				authority: 'request',
				cardinality: 'one',
				kind: 'plugin',
				method: 'archiveOne',
				operation: 'archive',
			},
			kind: 'plugin',
		})
		expect(exposure.transport).toBe(protocol)
		expect(Object.isFrozen(exposure)).toBe(true)
	})

	it('never serves Master or many-row commands, even when a key opens them', async () => {
		await setup([declare('ExposureUnserved', { expose: true, wire: true })])

		expect(methodsOf(plan(), 'ExposureUnserved')).not.toEqual(
			expect.arrayContaining(['purgeOne']),
		)
		expect(methodsOf(plan(), 'ExposureUnserved')).not.toContain('shoutMany')
	})

	it('lists the exposed writes of every schema', async () => {
		await setup([
			declare('ExposureWriteGroups', { expose: { write: false, create: true } }),
			declare('ExposureWriteCommand', {
				expose: { read: false, write: false, archive: true },
			}),
		])

		expect(
			plan().writes.map(({ schema, method }) => `${schema}.${method.entry.method}`),
		).toEqual([
			'ExposureWriteGroups.createOne',
			'ExposureWriteGroups.createMany',
			'ExposureWriteCommand.archiveOne',
		])
	})
})

describe('exposure plan diagnostics (ADR-0347)', () => {
	it.each([
		[
			{ wire: { bogus: true } },
			'wire.bogus on ExposureUnknownKey names no schema method or exposable command; its commands are archive, archiveOne',
		],
		[
			{ expose: { archiveMany: true } },
			'expose.archiveMany on ExposureUnknownKey names no schema method or exposable command; its commands are archive, archiveOne',
		],
		[
			{ expose: { purge: true } },
			'expose.purge on ExposureUnknownKey names no schema method or exposable command; its commands are archive, archiveOne',
		],
	])('refuses a key naming no served command %#', async (rules, error) => {
		await setup([declare('ExposureUnknownKey', rules)])

		expect(() => plan()).toThrow(new TypeError(error))
	})

	it.each([
		[{}, undefined, undefined],
		[{ expose: true }, undefined, undefined],
		[{ expose: { create: true } }, undefined, undefined],
		[
			{ expose: { createOne: true } },
			undefined,
			'Remove createOne from .with({ expose }) of ExposureClosed.',
		],
		[
			{ wire: { createOne: true } },
			undefined,
			'Remove createOne from .with({ wire }) of ExposureClosed.',
		],
		[
			{},
			{ createOne: true },
			'Remove createOne from wirePlugin({ default }), or set it to false in .with({ wire }) of ExposureClosed.',
		],
	])(
		'leaves a closed method unexposed and refuses only its explicit key %#',
		async (rules, defaultRule, remove) => {
			await setup(
				[declare('ExposureClosed', rules)],
				[closurePlugin('ExposureClosed')],
			)
			const compile = () =>
				plan(defaultRule === undefined ? {} : { default: defaultRule })

			if (remove === undefined) {
				expect(methodsOf(compile(), 'ExposureClosed')).not.toContain(
					'createOne',
				)
				return
			}
			expect(compile).toThrow(
				new TypeError(
					`ExposureClosed.createOne is closed by plugin "fixture.exposure-planning.closure": ${closureReason} ${remove}`,
				),
			)
		},
	)

	it.each([
		['expose', { expose: true }],
		['wire', { wire: true }],
	])(
		'refuses a plugin-owned schema that declares %s',
		async (key, rules) => {
			const storage = createPlugin({
				core: '^0.0.0',
				id: 'fixture.exposure-planning.storage',
				permissions: { 'schema:declare': 'Declares storage.' },
				version: '1.0.0',
				contributions: [
					contributeDeclarations({
						schema: ({ schemas }) => {
							schemas.add({
								contributionId: 'storage',
								schema: declare('ExposureStorage', rules),
							})
							return undefined
						},
					}),
				],
			})
			await setup([], [storage])

			expect(() => plan()).toThrow(
				new TypeError(
					`Plugin-owned schema "ExposureStorage" cannot declare .with({ ${key} }): transports expose application schemas only`,
				),
			)
		},
	)

	it('plans only a schema key the calling transport defines', async () => {
		await setup([declare('ExposureOwnedKey', { wire: true })], [foreignPlugin])

		expect(() => plan({ schemaKey: 'fields' })).toThrow(
			new TypeError('exposure planning schemaKey fields is reserved by Core'),
		)
		expect(() => planWith(foreignHarness)).toThrow(
			new TypeError(
				'exposure planning schemaKey wire is not defined by plugin "fixture.exposure-planning.foreign"',
			),
		)
	})
})

describe('exposure plan operations and cache (ADR-0347)', () => {
	it('lists the public operations after hide', async () => {
		await setup([])

		expect(plan().operations.map(({ name }) => name)).toEqual([
			echo.name,
			ping.name,
		])
	})

	it('refuses to hide an operation the transport does not expose', async () => {
		await setup([])

		expect(() => plan({ hide: [internal] })).toThrow(
			new TypeError(
				`wirePlugin({ hide }) lists ${internal.name}, which Wire does not expose: it is not a public operation, or its owner binds it to other transports only`,
			),
		)
	})

	it('compiles once per protocol and refuses other options afterwards', async () => {
		await setup([declare('ExposureCached', {})])
		const first = plan({ hide: [echo] })

		expect(first.operations.map(({ name }) => name)).toEqual([ping.name])
		expect(plan({ hide: [echo] })).toBe(first)
		expect(() => plan({ default: { count: true } })).toThrow(
			new TypeError(
				'Exposure plan for fixture.exposure-planning.wire@1.0.0 is already compiled with other options',
			),
		)
	})
})

describe('the expose warning at start (ADR-0347)', () => {
	const database = createPlugin({
		core: '^0.0.0',
		id: 'fixture.exposure-planning.database',
		version: '1.0.0',
		contributions: [
			provideTestDatabaseAdapter(new RecordingDatabaseAdapter([], [])),
		],
	})
	const capture = () => {
		const warnings: string[] = []
		const ignore = (): void => undefined
		const logger: Logger = {
			debug: ignore,
			error: ignore,
			info: ignore,
			warn: (line: string) => {
				warnings.push(line)
			},
		}
		return { logger, warnings }
	}
	const start = async (planned: boolean) => {
		const { logger, warnings } = capture()
		const application = await createApplication({
			logger,
			plugins: [database, wirePlugin],
			schemas: [
				declare('ExposeWarned', { expose: { count: true } }),
				declare('ExposeSilent', {}),
			],
		})
		onTestFinished(() => application.dispose())
		if (planned) plan()
		await application.start()
		return warnings
	}

	it('warns once per schema declaring expose when no transport planned', async () => {
		expect(await start(false)).toEqual([
			'ExposeWarned declares expose, but no transport is installed: it has no effect.',
		])
	})

	it('stays silent once a transport asked for a plan', async () => {
		expect(await start(true)).toEqual([])
	})
})
