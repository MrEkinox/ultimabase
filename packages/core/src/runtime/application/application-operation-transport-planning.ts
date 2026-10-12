import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import { FrameworkError } from '../../errors/framework-error.js'
import { assertExactEnumerableKeys } from '../../exact-object-validation.js'
import { readApplicationKernelState } from '../../application/application-kernel-state.js'
import { resolveCommandTransport } from '../commands/default-transports.js'
import {
	describeOperationTransport,
	projectPublicOperationTransports,
} from '../commands/transport-projection.js'
import {
	defineCapability,
	provideCapability,
	type CapabilityToken,
} from '../../plugins/capabilities.js'
import {
	defineCoreFoundationProvider,
	type CoreFoundationProvider,
} from '../../plugins/capability-providers.js'
import { readApplicationPluginOwner } from '../../plugins/callback-execution.js'
import {
	isPluginOperationDefinition,
	type PluginOperationDefinition,
} from '../../plugins/plugin-operations.js'
import { isOperationTransportProtocol } from '../plugin-operations/capabilities.js'
import type { OperationTransportProtocol } from '../plugin-operations/contracts.js'
import type { ExposedOperationTransportBinding } from '../plugin-operations/transport.js'
import {
	planApplicationSchemaMutations,
	type ApplicationSchemaMutationTransportPlan,
	type SchemaMutationTransportPlanningOptions,
} from './schema-mutation-transport-planning.js'

/**
 * Selects exact operation tokens for deterministic transport schema planning;
 * without `operations`, every public operation (ADR-0324).
 */
export interface OperationTransportPlanningOptions<
	TTransport extends OperationTransportProtocol = OperationTransportProtocol,
> {
	readonly operations?: readonly PluginOperationDefinition[]
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
}

const plannerStates = new WeakMap<object, PlannerState>()
const planningOptionKeys = new Set(['operations', 'transport'])
const schemaPlanningOptionKeys = new Set(['bindings', 'transport'])

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
	const graph = readApplicationKernelState(application).commands
	const command = graph.fromSource(operation)
	if (command?.kind !== 'operation') {
		throw operationFailure(
			operation,
			'operation-planning-token-invalid',
			`Operation ${operation.name} is not an installed application operation.`,
		)
	}
	const owned = resolveCommandTransport(graph, command, transport)
	if (owned?.kind !== 'operation') {
		throw operationFailure(
			operation,
			'operation-planning-binding-missing',
			`Operation ${operation.name} requires one exact binding for ${transport.name}@${transport.version}.`,
		)
	}
	return describeOperationTransport(graph, command, owned)
}

/** Requires a bound planner and an attributed owner allowed to expose transports. */
const authorizePlanning = (
	planner: object,
	subject: string,
	kind: string,
): object => {
	const application = plannerStates.get(planner)?.application
	if (application === undefined) {
		throw new TypeError(
			'Application operation transport planner is unavailable',
		)
	}
	const owner = readApplicationPluginOwner(application)
	if (owner === undefined) {
		throw new FrameworkError(
			'PLUGIN_PRIVILEGE_DENIED',
			`${subject} transport planning requires an attributed plugin callback.`,
			{ internalDetails: { kind } },
		)
	}
	readApplicationKernelState(application).assertPrivilege(
		owner,
		'transport:expose',
	)
	return application
}

class CoreApplicationOperationTransportPlanner implements ApplicationOperationTransportPlanner {
	plan<const TTransport extends OperationTransportProtocol>(
		options: OperationTransportPlanningOptions<TTransport>,
	): ApplicationOperationTransportPlan<TTransport> {
		const application = authorizePlanning(
			this,
			'Operation',
			'operation-planning-owner-missing',
		)
		if (
			!isPlainRecord(options) ||
			!isOperationTransportProtocol(options.transport) ||
			(options.operations !== undefined && !isUnknownArray(options.operations))
		) {
			throw new TypeError(
				'operation transport planning requires a protocol and operation list',
			)
		}
		assertExactEnumerableKeys(
			options,
			planningOptionKeys,
			'operation transport planning contains unknown key: ',
		)
		if (options.operations === undefined) {
			return immutableRecord({
				operations: projectPublicOperationTransports(
					readApplicationKernelState(application).commands,
					options.transport,
				),
				transport: options.transport,
			})
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
			descriptors.push(descriptorFor(operation, options.transport, application))
		}
		return immutableRecord({
			operations: immutableArray(descriptors),
			transport: options.transport,
		})
	}

	planSchemaMutations<const TTransport extends OperationTransportProtocol>(
		options: SchemaMutationTransportPlanningOptions<TTransport>,
	): ApplicationSchemaMutationTransportPlan<TTransport> {
		const application = authorizePlanning(
			this,
			'Schema mutation',
			'schema-mutation-planning-owner-missing',
		)
		if (
			!isPlainRecord(options) ||
			!isOperationTransportProtocol(options.transport)
		) {
			throw new TypeError(
				'schema mutation transport planning requires a protocol',
			)
		}
		assertExactEnumerableKeys(
			options,
			schemaPlanningOptionKeys,
			'schema mutation transport planning contains unknown key: ',
		)
		return planApplicationSchemaMutations(
			readApplicationKernelState(application).commands,
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
			}
			plannerStates.set(planner, state)
			Object.freeze(planner)
			return immutableRecord({
				value: planner,
				dispose: () => {
					state.application = undefined
					state.disposed = true
				},
			})
		},
	},
)

/** @internal Supplies the planning facade only when one transport consumes it. */
export const canonicalApplicationOperationTransportPlanningFoundation: CoreFoundationProvider<
	typeof applicationOperationTransportPlanningCapability
> = defineCoreFoundationProvider(canonicalPlanner)

/** @internal Binds static application provenance before transport compilation. */
export const bindApplicationOperationTransportPlanner = (
	planner: unknown,
	application: object,
): void => {
	if (planner === undefined) return
	if (typeof planner !== 'object' || planner === null) {
		throw new TypeError('Unknown application operation transport planner')
	}
	const state = plannerStates.get(planner)
	if (state === undefined || state.disposed) {
		throw new TypeError('Unknown application operation transport planner')
	}
	if (state.application !== undefined) {
		throw new TypeError(
			'Application operation transport planner is already bound',
		)
	}
	state.application = application
}

/** Identifies the non-replaceable Core operation planning protocol. */
export const isApplicationOperationTransportPlanningCapability = (
	token: object,
): boolean => token === applicationOperationTransportPlanningCapability
