import {
	Schema,
	contributeApplication,
	contributeDeclarations,
	defineCapability,
	defineSchemaOption,
	getOperationSchema,
	provideCapability,
	provideRuntimeBehavior,
	plugin as createPlugin,
	requireCapability,
	withPluginPrivileges,
	type CompiledSchemaRegistry,
	type JsonObject,
	type OperationKind,
	type RuntimeBehaviorStages,
} from '@ultimabase/core'
import {
	createPluginEventDispatcher,
	definePluginEvent,
	definePluginEventCapability,
	observePluginEvent,
	optionalPluginEvents,
	providePluginEvent,
	type PluginEventHandler,
} from '@ultimabase/plugin-kit'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

export const alternativeBehaviorPluginId =
	'fixture.alternative-behavior-engine' as const
export const alternativeBehaviorOptionName = 'alternativeBehavior' as const

export interface AlternativeBehaviorOptions {
	/** Labels audit records and committed diagnostics for this schema. */
	readonly label: string
}

declare module '@ultimabase/core' {
	interface UltimaBaseGeneratedSchemaOptions {
		/** Configures the independent behavior fixture when its plugin is installed. */
		readonly alternativeBehavior?: AlternativeBehaviorOptions
	}
}

export interface AlternativeBehaviorTrace {
	readonly operation: OperationKind
	readonly phase: 'before-operation' | 'result'
	readonly schema: string
}

export interface AlternativeBehaviorDiagnosticPayload extends JsonObject {
	readonly label: string
	readonly operation: OperationKind
	readonly schema: string
}

export const alternativeBehaviorDiagnosticEvent =
	definePluginEvent<AlternativeBehaviorDiagnosticPayload>()(
		'fixture.alternative-behavior.committed',
		{ delivery: 'optional' },
	)

export const alternativeBehaviorDiagnosticCapability =
	definePluginEventCapability({
		capabilityId: 'fixture.alternative-behavior.diagnostics',
		version: '1.0.0',
	})

const optionalDiagnostics = optionalPluginEvents(
	alternativeBehaviorDiagnosticCapability,
	'^1.0.0',
)

interface AlternativeBehaviorRuntimeState {
	record(trace: AlternativeBehaviorTrace): void
	snapshot(): readonly AlternativeBehaviorTrace[]
}

const runtimeStateCapability =
	defineCapability<AlternativeBehaviorRuntimeState>()({
		capabilityId: 'fixture.alternative-behavior.runtime-state',
		version: '1.0.0',
		cardinality: 'single',
		lifetime: 'application',
		compose: ([state]) => state,
	})
const runtimeState = requireCapability(runtimeStateCapability, '^1.0.0')

const mutationKinds: ReadonlySet<OperationKind> = new Set([
	'create-many',
	'create-one',
	'delete-many',
	'delete-one',
	'update-many',
	'update-one',
	'upsert-many',
	'upsert-one',
])

/** Declares a compact alternative lifecycle without using official Hook phases. */
export const alternativeBehavior = (options: AlternativeBehaviorOptions) => {
	const untrustedOptions: unknown = options
	if (
		!isPlainRecord(untrustedOptions) ||
		typeof untrustedOptions.label !== 'string' ||
		untrustedOptions.label.trim() === ''
	) {
		throw new TypeError('alternative behavior label must be a non-empty string')
	}

	return immutableRecord({ label: untrustedOptions.label })
}

const alternativeBehaviorSchemaOption = defineSchemaOption({
	normalize: (value) =>
		alternativeBehavior(value as AlternativeBehaviorOptions),
	protocolVersion: 1,
	typegen: {
		module: './fixtures/alternative-behavior-engine.js',
		type: 'AlternativeBehaviorOptions',
	},
	valueKind: 'json',
})

const readOperationIdentity = (
	operation: Readonly<{ readonly kind: OperationKind }>,
): Readonly<{ readonly operation: OperationKind; readonly schema: string }> => {
	const schema: unknown = getOperationSchema(operation)
	if (
		(typeof schema !== 'object' && typeof schema !== 'function') ||
		schema === null ||
		!('className' in schema) ||
		typeof schema.className !== 'string'
	) {
		throw new TypeError('alternative behavior requires a normalized schema')
	}

	return immutableRecord({
		operation: operation.kind,
		schema: schema.className,
	})
}

const compileAlternativeBehaviorPlan = (
	schemas: CompiledSchemaRegistry,
): ReadonlyMap<string, AlternativeBehaviorOptions> => {
	const plan = new Map<string, AlternativeBehaviorOptions>()

	for (const schema of schemas.values()) {
		if (!Object.hasOwn(schema.definition, alternativeBehaviorOptionName))
			continue
		const config: unknown = Reflect.get(
			schema.definition,
			alternativeBehaviorOptionName,
		)
		if (
			!isPlainRecord(config) ||
			typeof config.label !== 'string' ||
			config.label.trim() === ''
		) {
			throw new TypeError(
				`Invalid alternative behavior configuration on ${schema.className}`,
			)
		}
		plan.set(schema.className, immutableRecord({ label: config.label }))
	}

	return plan
}

const createRuntimeState = (): AlternativeBehaviorRuntimeState => {
	const traces: AlternativeBehaviorTrace[] = []

	return immutableRecord({
		record: (trace: AlternativeBehaviorTrace): void => {
			traces.push(immutableRecord(trace))
		},
		snapshot: (): readonly AlternativeBehaviorTrace[] => immutableArray(traces),
	})
}

export interface AlternativeBehaviorEngineOptions {
	readonly instanceId?: string
	readonly onDispose?: () => void
}

/** Builds an independent behavior engine entirely from public kernel contracts. */
export const createAlternativeBehaviorEngine = (
	options: AlternativeBehaviorEngineOptions = {},
) => {
	const suffix = (options.instanceId ?? 'default').replace(/[^A-Za-z0-9]/gu, '')
	const Audit = Schema.define({
		className: `AlternativeBehaviorAudit${suffix}`,
		fields: (field) => ({
			action: field.string({ required: true }),
			label: field.string({ required: true }),
			schema: field.string({ required: true }),
		}),
	})
	const stateProvider = provideCapability(runtimeStateCapability, {
		contributionId: 'runtime-state',
		create: () => ({ value: createRuntimeState() }),
	})
	const behaviorProvider = provideRuntimeBehavior({
		contributionId: 'declarative-behavior-runtime',
		create: ({ assertPrivilege, capabilities, owner, schemas }) => {
			const state = capabilities.get(runtimeState)
			const plan = compileAlternativeBehaviorPlan(schemas)
			const diagnostics = createPluginEventDispatcher({
				assertPrivilege,
				capabilities,
				owner,
				requirement: optionalDiagnostics,
			})
			const behavior: RuntimeBehaviorStages = immutableRecord({
				beforeOperation: async ({ context, operation }) => {
					const identity = readOperationIdentity(operation)
					const config = plan.get(identity.schema)
					if (config === undefined || !mutationKinds.has(identity.operation)) {
						return
					}
					state.record({ ...identity, phase: 'before-operation' })
					await Audit.createOne({
						data: {
							action: identity.operation,
							label: config.label,
							schema: identity.schema,
						},
					})
					diagnostics.emit(context, alternativeBehaviorDiagnosticEvent, {
						label: config.label,
						operation: identity.operation,
						schema: identity.schema,
					})
				},
				transformResult: (input) => {
					const identity = readOperationIdentity(input.operation)
					if (plan.has(identity.schema)) {
						state.record({ ...identity, phase: 'result' })
					}
					return input.result
				},
			})

			return immutableRecord({
				dispose: () => options.onDispose?.(),
				value: behavior,
			})
		},
	})
	const plugin = createPlugin({
		core: '^0.0.0',
		id: alternativeBehaviorPluginId,
		version: '1.0.0',
		...(options.instanceId === undefined
			? {}
			: { instanceId: options.instanceId }),
		contributions: [
			stateProvider,
			withPluginPrivileges(behaviorProvider, ['event:publish']),
			runtimeState,
			optionalDiagnostics,
			contributeDeclarations({
				schema: ({ schemas }) => {
					schemas.defineOptions({
						contributionId: 'alternative-behavior-option',
						schema: {
							alternativeBehavior: alternativeBehaviorSchemaOption,
						},
					})
					schemas.add({
						contributionId: 'audit-schema',
						schema: Audit,
						staticOptions: { instanceId: options.instanceId ?? 'default' },
					})
				},
			}),
			contributeApplication(({ capabilities }) => {
				const state = capabilities.get(runtimeState)
				return {
					exports: immutableRecord({ diagnostics: () => state.snapshot() }),
				}
			}),
		],
		permissions: {
			'schema:declare':
				'Declares the alternative behavior schema option and audit schema.',
			'runtime:intercept':
				'Runs the independent declarative behavior lifecycle.',
			'event:publish': 'Publishes committed alternative behavior diagnostics.',
		},
	})

	return immutableRecord({ Audit, plugin })
}

/** Provides a compatible observer without creating a dependency on official Hooks. */
export const createAlternativeBehaviorDiagnosticObserver = (
	handler: PluginEventHandler<
		typeof alternativeBehaviorDiagnosticEvent.name,
		AlternativeBehaviorDiagnosticPayload
	>,
) =>
	createPlugin({
		core: '^0.0.0',
		id: 'fixture.alternative-behavior-diagnostic-observer',
		version: '1.0.0',
		peers: [{ pluginId: alternativeBehaviorPluginId, version: '^1.0.0' }],
		contributions: [
			providePluginEvent(
				alternativeBehaviorDiagnosticCapability,
				'committed-diagnostics',
				observePluginEvent(alternativeBehaviorDiagnosticEvent, handler),
			),
		],
		permissions: {
			'runtime:observe': 'Observes committed alternative behavior diagnostics.',
		},
	})

/** Proves generic middleware can compose with no lifecycle engine at all. */
export const createSharedRuntimeMiddleware = (
	onResult: (schema: string) => void,
) =>
	createPlugin({
		core: '^0.0.0',
		id: 'fixture.shared-runtime-middleware',
		version: '1.0.0',
		contributions: [
			provideRuntimeBehavior({
				contributionId: 'result-observer',
				create: () => ({
					value: {
						transformResult: (input) => {
							const identity = readOperationIdentity(input.operation)
							onResult(identity.schema)
							return input.result
						},
					},
				}),
			}),
		],
		permissions: {
			'runtime:intercept':
				'Observes results through the shared low-level boundary.',
		},
	})
