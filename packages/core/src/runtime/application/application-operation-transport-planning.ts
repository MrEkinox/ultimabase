import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

import { FrameworkError } from '../../errors/framework-error.js'
import type { CompiledPluginOperation } from '../../plugins/application-surface-registry.js'
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
import {
	isOperationTransportBinding,
	isOperationTransportProtocol,
} from '../plugin-operations/capabilities.js'
import type { OperationTransportProtocol } from '../plugin-operations/contracts.js'
import type { ExposedOperationTransportBinding } from '../plugin-operations/transport.js'

/** Selects exact operation tokens for deterministic transport schema planning. */
export interface OperationTransportPlanningOptions<
	TTransport extends OperationTransportProtocol = OperationTransportProtocol,
> {
	readonly operations: readonly PluginOperationDefinition<
		string,
		string,
		'application'
	>[]
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
}

interface PlannerState {
	application: object | undefined
	bindings: readonly CapabilityProviderContribution[] | undefined
	disposed: boolean
	resolveOperation:
		((name: string) => CompiledPluginOperation | undefined) | undefined
}

interface BoundPlannerState {
	readonly bindings: readonly CapabilityProviderContribution[]
	readonly resolveOperation: (
		name: string,
	) => CompiledPluginOperation | undefined
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

const sameOwner = (
	compiled: CompiledPluginOperation,
	contribution: CapabilityProviderContribution,
): boolean =>
	compiled.owner.pluginId === contribution.owner.pluginId &&
	compiled.owner.instanceId === contribution.owner.instanceId &&
	compiled.owner.version === contribution.pluginVersion

const descriptorFor = (
	operation: PluginOperationDefinition,
	transport: OperationTransportProtocol,
	state: BoundPlannerState,
): ExposedOperationTransportBinding => {
	const compiled = state.resolveOperation(operation.name)
	if (compiled?.operation !== operation || operation.target !== 'application') {
		throw operationFailure(
			operation,
			'operation-planning-token-invalid',
			`Operation ${operation.name} is not an installed application operation.`,
		)
	}
	const matches = state.bindings.filter(
		(contribution) =>
			isOperationTransportBinding(contribution.value) &&
			contribution.value.operation === operation &&
			contribution.value.transport === transport,
	)
	if (matches.length !== 1) {
		throw operationFailure(
			operation,
			matches.length === 0
				? 'operation-planning-binding-missing'
				: 'operation-planning-binding-conflict',
			`Operation ${operation.name} requires one exact binding for ${transport.name}@${transport.version}.`,
		)
	}
	const contribution = matches[0]
	if (
		contribution === undefined ||
		!isOperationTransportBinding(contribution.value) ||
		!sameOwner(compiled, contribution)
	) {
		throw operationFailure(
			operation,
			'operation-planning-owner-invalid',
			`Operation ${operation.name} binding is not owned by its declaration owner.`,
		)
	}
	return immutableRecord({
		errors: compiled.operation.errors,
		metadata: contribution.value.metadata,
		name: compiled.operation.name,
		owner: immutableRecord({
			...(compiled.owner.instanceId === undefined
				? {}
				: { instanceId: compiled.owner.instanceId }),
			pluginId: compiled.owner.pluginId,
			version: compiled.owner.version,
		}),
		version: compiled.operation.version,
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
			state.application === undefined ||
			state.bindings === undefined ||
			state.resolveOperation === undefined
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
				descriptorFor(operation, options.transport, {
					bindings: state.bindings,
					resolveOperation: state.resolveOperation,
				}),
			)
		}
		return immutableRecord({
			operations: immutableArray(descriptors),
			transport: options.transport,
		})
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
				bindings: undefined,
				disposed: false,
				resolveOperation: undefined,
			}
			plannerStates.set(planner, state)
			Object.freeze(planner)
			return immutableRecord({
				value: planner,
				dispose: () => {
					state.application = undefined
					state.bindings = undefined
					state.disposed = true
					state.resolveOperation = undefined
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
		readonly bindings: readonly CapabilityProviderContribution[]
		readonly resolveOperation: (
			name: string,
		) => CompiledPluginOperation | undefined
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
	state.bindings = immutableArray(options.bindings)
	state.resolveOperation = options.resolveOperation
}

/** Identifies the non-replaceable Core operation planning protocol. */
export const isApplicationOperationTransportPlanningCapability = (
	token: object,
): boolean => token === applicationOperationTransportPlanningCapability
