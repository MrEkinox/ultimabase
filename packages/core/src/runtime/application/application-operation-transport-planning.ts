import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import { FrameworkError } from '../../errors/framework-error.js'
import { readApplicationCommandGraph } from '../../plugins/application-command-graph.js'
import {
	defineCapability,
	provideCapability,
	type CapabilityProviderContribution,
	type CapabilityProviderDeclaration,
	type CapabilityToken,
} from '../../plugins/capabilities.js'
import { readApplicationPluginOwner } from '../../plugins/callback-execution.js'
import type { PluginIdentity } from '../../plugins/manifest.js'
import {
	isPluginOperationDefinition,
	type PluginOperationDefinition,
} from '../../plugins/plugin-operations.js'
import { assertApplicationPluginPrivilege } from '../../plugins/setup-registries.js'
import { isOperationTransportProtocol } from '../plugin-operations/capabilities.js'
import type { OperationTransportProtocol } from '../plugin-operations/contracts.js'
import type { ExposedOperationTransportBinding } from '../plugin-operations/transport.js'
import type { CompiledSchemaRegistry } from '../../schema/index.js'
import type { CompiledApplicationSchemaSurface } from '../../plugins/application-surface-registry.js'
import {
	planApplicationSchemaMutations,
	type ApplicationSchemaMutationTransportPlan,
	type SchemaMutationTransportPlanningOptions,
} from './schema-mutation-transport-planning.js'

/** Selects exact operation tokens for deterministic transport schema planning. */
export interface OperationTransportPlanningOptions<
	TTransport extends OperationTransportProtocol = OperationTransportProtocol,
> {
	readonly operations: readonly PluginOperationDefinition[]
	readonly transport: TTransport
}

/** Contains only inert descriptors needed to compile one public transport shape. */
export interface ApplicationOperationTransportPlan<
	TTransport extends OperationTransportProtocol = OperationTransportProtocol,
> {
	readonly operations: readonly ExposedOperationTransportBinding[]
	readonly transport: TTransport
}

/** Plans validated operation bindings without exposing codecs or Runtime state. */
export interface ApplicationOperationTransportPlanner {
	plan<const TTransport extends OperationTransportProtocol>(
		options: OperationTransportPlanningOptions<TTransport>,
	): ApplicationOperationTransportPlan<TTransport>
	/** Plans every exact schema mutation explicitly bound to one transport. */
	planSchemaMutations<const TTransport extends OperationTransportProtocol>(
		options: SchemaMutationTransportPlanningOptions<TTransport>,
	): ApplicationSchemaMutationTransportPlan<TTransport>
}

interface PlannerState {
	application: object | undefined
	disposed: boolean
	resolveSchemaSurface:
		| ((className: string) => CompiledApplicationSchemaSurface | undefined)
		| undefined
	schemaMutationBindings: readonly CapabilityProviderContribution[] | undefined
	schemas: CompiledSchemaRegistry | undefined
}

const plannerStates = new WeakMap<
	ApplicationOperationTransportPlanner,
	PlannerState
>()
const planningOptionKeys = new Set(['operations', 'transport'])

const operationFailure = (
	operation: PluginOperationDefinition,
	kind: string,
	message: string,
): FrameworkError<'PLUGIN_OPERATION_INVALID'> =>
	new FrameworkError('PLUGIN_OPERATION_INVALID', message, {
		publicMessage: 'The requested operation is not available.',
		internalDetails: { kind, operation: operation.name },
	})

const descriptorFor = (
	operation: PluginOperationDefinition,
	transport: OperationTransportProtocol,
	application: object,
): ExposedOperationTransportBinding => {
	const graph = readApplicationCommandGraph(application)
	const command = graph.fromSource(operation)
	if (command?.kind !== 'operation') {
		throw operationFailure(
			operation,
			'operation-planning-token-invalid',
			`Operation ${operation.name} is not an installed application operation.`,
		)
	}
	const owned = graph.bindings.transport(operation, transport)
	if (owned?.kind !== 'operation') {
		throw operationFailure(
			operation,
			'operation-planning-binding-missing',
			`Operation ${operation.name} requires one exact binding for ${transport.name}@${transport.version}.`,
		)
	}
	return immutableRecord({
		errors: command.definition.errors,
		metadata: owned.binding.metadata,
		name: command.definition.name,
		owner: immutableRecord({
			...(command.owner.instanceId === undefined
				? {}
				: { instanceId: command.owner.instanceId }),
			pluginId: command.owner.pluginId,
			version: command.owner.version,
		}),
		version: command.definition.version,
	})
}

class CoreApplicationOperationTransportPlanner implements ApplicationOperationTransportPlanner {
	plan<const TTransport extends OperationTransportProtocol>(
		options: OperationTransportPlanningOptions<TTransport>,
	): ApplicationOperationTransportPlan<TTransport> {
		const state = plannerStates.get(this)
		if (
			state === undefined ||
			state.disposed ||
			state.application === undefined
		) {
			throw new TypeError(
				'Application operation transport planner is unavailable',
			)
		}
		const owner = readApplicationPluginOwner(state.application)
		if (owner === undefined) {
			throw new FrameworkError(
				'PLUGIN_PRIVILEGE_DENIED',
				'Operation transport planning requires an attributed plugin callback.',
				{ internalDetails: { kind: 'operation-planning-owner-missing' } },
			)
		}
		assertApplicationPluginPrivilege(
			state.application,
			owner,
			'transport:expose',
		)
		if (
			!isPlainRecord(options) ||
			!isOperationTransportProtocol(options.transport) ||
			!isUnknownArray(options.operations)
		) {
			throw new TypeError(
				'operation transport planning requires a protocol and operation list',
			)
		}
		for (const key of Object.keys(options)) {
			if (!planningOptionKeys.has(key)) {
				throw new TypeError(
					`operation transport planning contains unknown key: ${key}`,
				)
			}
		}
		const names = new Set<string>()
		const descriptors: ExposedOperationTransportBinding[] = []
		for (const [index, operation] of options.operations.entries()) {
			if (!isPluginOperationDefinition(operation)) {
				throw new TypeError(
					`operation transport planning operations[${String(index)}] must be an operation token`,
				)
			}
			if (names.has(operation.name)) {
				throw new TypeError(
					`operation transport planning repeats ${operation.name}`,
				)
			}
			names.add(operation.name)
			descriptors.push(
				descriptorFor(operation, options.transport, state.application),
			)
		}
		return immutableRecord({
			operations: immutableArray(descriptors),
			transport: options.transport,
		})
	}

	planSchemaMutations<const TTransport extends OperationTransportProtocol>(
		options: SchemaMutationTransportPlanningOptions<TTransport>,
	): ApplicationSchemaMutationTransportPlan<TTransport> {
		const state = plannerStates.get(this)
		if (
			state === undefined ||
			state.disposed ||
			state.application === undefined ||
			state.resolveSchemaSurface === undefined ||
			state.schemaMutationBindings === undefined ||
			state.schemas === undefined
		) {
			throw new TypeError(
				'Application operation transport planner is unavailable',
			)
		}
		const owner = readApplicationPluginOwner(state.application)
		if (owner === undefined) {
			throw new FrameworkError(
				'PLUGIN_PRIVILEGE_DENIED',
				'Schema mutation transport planning requires an attributed plugin callback.',
				{
					internalDetails: {
						kind: 'schema-mutation-planning-owner-missing',
					},
				},
			)
		}
		assertApplicationPluginPrivilege(
			state.application,
			owner,
			'transport:expose',
		)
		if (
			!isPlainRecord(options) ||
			!isOperationTransportProtocol(options.transport)
		) {
			throw new TypeError(
				'schema mutation transport planning requires a protocol',
			)
		}
		for (const key of Object.keys(options)) {
			if (key !== 'transport') {
				throw new TypeError(
					`schema mutation transport planning contains unknown key: ${key}`,
				)
			}
		}
		return planApplicationSchemaMutations(
			{
				application: state.application,
				bindings: state.schemaMutationBindings,
				resolveSurface: state.resolveSchemaSurface,
				schemas: state.schemas,
			},
			options,
		)
	}
}

/** Provides transports with static, owner-validated operation binding facts. */
export const applicationOperationTransportPlanningCapability: CapabilityToken<
	ApplicationOperationTransportPlanner,
	ApplicationOperationTransportPlanner,
	'ultimabase.application-operation-transport-planning',
	'1.0.0',
	'single',
	'application'
> = defineCapability<ApplicationOperationTransportPlanner>()({
	capabilityId: 'ultimabase.application-operation-transport-planning',
	version: '1.0.0',
	cardinality: 'single',
	lifetime: 'application',
	compose: ([provider]) => {
		if (!plannerStates.has(provider)) {
			throw new TypeError(
				'Application operation transport planning must use the Core provider',
			)
		}
		return provider
	},
})

const canonicalPlanner = provideCapability(
	applicationOperationTransportPlanningCapability,
	{
		contributionId: 'application-operation-transport-planner',
		create: () => {
			const planner = new CoreApplicationOperationTransportPlanner()
			const state: PlannerState = {
				application: undefined,
				disposed: false,
				resolveSchemaSurface: undefined,
				schemaMutationBindings: undefined,
				schemas: undefined,
			}
			plannerStates.set(planner, state)
			Object.freeze(planner)
			return immutableRecord({
				value: planner,
				dispose: () => {
					state.application = undefined
					state.disposed = true
					state.resolveSchemaSurface = undefined
					state.schemaMutationBindings = undefined
					state.schemas = undefined
				},
			})
		},
	},
)

/** @internal Supplies the planning facade only when one transport consumes it. */
export const canonicalApplicationOperationTransportPlanningFoundation: Readonly<{
	declaration: CapabilityProviderDeclaration<
		typeof applicationOperationTransportPlanningCapability
	>
	owner: PluginIdentity
	version: string
}> = immutableRecord({
	declaration: canonicalPlanner,
	owner: immutableRecord({ pluginId: '@ultimabase/core' }),
	version: '0.0.0',
})

/** @internal Binds static application provenance before transport compilation. */
export const bindApplicationOperationTransportPlanner = (
	planner: unknown,
	options: Readonly<{
		readonly application: object
		readonly resolveSchemaSurface: (
			className: string,
		) => CompiledApplicationSchemaSurface | undefined
		readonly schemaMutationBindings: readonly CapabilityProviderContribution[]
		readonly schemas: CompiledSchemaRegistry
	}>,
): void => {
	if (planner === undefined) return
	if (typeof planner !== 'object' || planner === null) {
		throw new TypeError('Unknown application operation transport planner')
	}
	const state = plannerStates.get(
		planner as ApplicationOperationTransportPlanner,
	)
	if (state === undefined || state.disposed) {
		throw new TypeError('Unknown application operation transport planner')
	}
	if (state.application !== undefined) {
		throw new TypeError(
			'Application operation transport planner is already bound',
		)
	}
	state.application = options.application
	state.resolveSchemaSurface = options.resolveSchemaSurface
	state.schemaMutationBindings = immutableArray(options.schemaMutationBindings)
	state.schemas = options.schemas
}

/** Identifies the non-replaceable Core operation planning protocol. */
export const isApplicationOperationTransportPlanningCapability = (
	token: object,
): boolean => token === applicationOperationTransportPlanningCapability
