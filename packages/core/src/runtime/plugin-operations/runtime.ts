import { immutableRecord } from '@ultimabase/shared'

import type {
	ApplicationContributionOwner,
	PluginOperationEnvelope,
} from '../../application/application-handles.js'
import { FrameworkError } from '../../errors/framework-error.js'
import { PluginError } from '../../errors/plugin-error.js'
import type {
	FrameworkApplication,
	PluginDefinition,
} from '../../foundation.js'
import { readApplicationCapabilityContributions } from '../../plugins/application-capability-access.js'
import type { CompiledPluginOperation } from '../../plugins/application-surface-registry.js'
import { runWithApplicationPluginOwner } from '../../plugins/callback-execution.js'
import { formatPluginIdentity } from '../../plugins/manifest.js'
import { assertImmutableOperationValue } from '../../plugins/plugin-operation-boundaries.js'
import type { PluginOperationDefinition } from '../../plugins/plugin-operations.js'
import type { SchemaDefinition } from '../../schema/index.js'
import { createRequestAdapterAccess } from '../adapters/request-access.js'
import type { RequestEngine } from '../engine/framework-engine.js'
import {
	getOperationWireCodec,
	getPluginOperationHandler,
	isOperationTransportBinding,
	operationTransportBindingCapability,
	pluginOperationHandlerCapability,
} from './capabilities.js'
import type {
	OperationTransportBindingDefinition,
	OperationTransportProtocol,
	PluginOperationExecutionTarget,
	PluginOperationHandler,
} from './contracts.js'

interface OwnedHandler {
	readonly contributionId: string
	readonly execute: PluginOperationHandler
	readonly owner: ApplicationContributionOwner
}

export interface OwnedTransportBinding {
	readonly binding: OperationTransportBindingDefinition
	readonly contributionId: string
	readonly owner: ApplicationContributionOwner
}

const snapshotOwner = (contribution: {
	readonly owner: {
		readonly pluginId: string
		readonly instanceId?: string | undefined
	}
	readonly pluginVersion: string
}): ApplicationContributionOwner =>
	immutableRecord({
		pluginId: contribution.owner.pluginId,
		...(contribution.owner.instanceId === undefined
			? {}
			: { instanceId: contribution.owner.instanceId }),
		version: contribution.pluginVersion,
	})

const sameOwner = (
	compiled: CompiledPluginOperation,
	contribution: {
		readonly owner: {
			readonly pluginId: string
			readonly instanceId?: string | undefined
		}
		readonly pluginVersion: string
	},
): boolean =>
	compiled.owner.pluginId === contribution.owner.pluginId &&
	compiled.owner.instanceId === contribution.owner.instanceId &&
	compiled.owner.version === contribution.pluginVersion

const invalidContribution = (
	contribution: {
		readonly contributionId: string
		readonly owner: {
			readonly instanceId?: string | undefined
			readonly pluginId: string
		}
	},
	kind: string,
	label: string,
): FrameworkError<'PLUGIN_OPERATION_INVALID'> =>
	new FrameworkError(
		'PLUGIN_OPERATION_INVALID',
		`Plugin "${formatPluginIdentity(contribution.owner)}" provided an invalid ${label}.`,
		{
			internalDetails: {
				kind,
				plugin: formatPluginIdentity(contribution.owner),
				contributionId: contribution.contributionId,
			},
		},
	)

const operationFailure = (
	compiled: CompiledPluginOperation,
	kind: string,
	message: string,
	cause?: unknown,
	contributionId?: string,
): FrameworkError<'PLUGIN_OPERATION_INVALID'> =>
	new FrameworkError('PLUGIN_OPERATION_INVALID', message, {
		cause,
		publicMessage: 'The requested operation could not be completed.',
		internalDetails: {
			kind,
			operation: compiled.operation.name,
			plugin: formatPluginIdentity(compiled.owner),
			...(contributionId === undefined ? {} : { contributionId }),
		},
	})

const isPluginError = (error: unknown): error is PluginError =>
	error instanceof PluginError

/** Resolves and executes owner-bound plugin operations for one application. */
export class PluginOperationRuntime {
	readonly #handlers = new Map<PluginOperationDefinition, OwnedHandler>()
	readonly #transportBindings = new Map<
		OperationTransportProtocol,
		Map<PluginOperationDefinition, OwnedTransportBinding>
	>()

	constructor(
		private readonly application: FrameworkApplication<
			readonly SchemaDefinition[],
			readonly PluginDefinition[]
		>,
	) {
		for (const contribution of readApplicationCapabilityContributions(
			application,
			pluginOperationHandlerCapability,
		)) {
			const definition = contribution.value
			const execute = getPluginOperationHandler(definition)
			if (execute === undefined) {
				throw invalidContribution(
					contribution,
					'operation-handler-owner-invalid',
					'operation handler',
				)
			}
			const compiled = application.getOperation(definition.operation.name)
			if (
				compiled?.operation !== definition.operation ||
				!sameOwner(compiled, contribution)
			) {
				throw invalidContribution(
					contribution,
					'operation-handler-owner-invalid',
					'operation handler',
				)
			}
			if (this.#handlers.has(definition.operation)) {
				throw operationFailure(
					compiled,
					'operation-handler-conflict',
					`Operation ${definition.operation.name} has multiple handlers.`,
				)
			}
			this.#handlers.set(
				definition.operation,
				immutableRecord({
					contributionId: contribution.contributionId,
					execute,
					owner: snapshotOwner(contribution),
				}),
			)
		}

		for (const contribution of readApplicationCapabilityContributions(
			application,
			operationTransportBindingCapability,
		)) {
			const binding = contribution.value
			if (!isOperationTransportBinding(binding)) {
				throw invalidContribution(
					contribution,
					'operation-transport-owner-invalid',
					'transport binding',
				)
			}
			const compiled = application.getOperation(binding.operation.name)
			if (
				compiled?.operation !== binding.operation ||
				!sameOwner(compiled, contribution)
			) {
				throw invalidContribution(
					contribution,
					'operation-transport-owner-invalid',
					'transport binding',
				)
			}
			let byOperation = this.#transportBindings.get(binding.transport)
			if (byOperation === undefined) {
				byOperation = new Map()
				this.#transportBindings.set(binding.transport, byOperation)
			}
			if (byOperation.has(binding.operation)) {
				throw operationFailure(
					compiled,
					'operation-transport-conflict',
					`Operation ${binding.operation.name} has duplicate bindings for ${binding.transport.name}.`,
				)
			}
			byOperation.set(
				binding.operation,
				immutableRecord({
					binding,
					contributionId: contribution.contributionId,
					owner: snapshotOwner(contribution),
				}),
			)
		}
	}

	/** Invokes one handler and enforces its result and public error contracts. */
	async execute(
		engine: RequestEngine,
		compiled: CompiledPluginOperation,
		envelope: PluginOperationEnvelope,
	): Promise<unknown> {
		const owned = this.#handlers.get(compiled.operation)
		if (owned === undefined) {
			throw operationFailure(
				compiled,
				'operation-handler-missing',
				`Operation ${compiled.operation.name} has no installed handler.`,
			)
		}
		const target: PluginOperationExecutionTarget = immutableRecord({
			kind: 'application',
		})
		try {
			const candidate = await runWithApplicationPluginOwner(
				this.application,
				owned.owner,
				() =>
					owned.execute(
						immutableRecord({
							adapters: createRequestAdapterAccess(engine, owned.owner),
							context: engine.context,
							engine,
							input: envelope.payload,
							owner: owned.owner,
							target,
						}),
					),
			)
			const result = compiled.operation.result.snapshot(
				candidate,
				`${compiled.operation.name}.result`,
			)
			assertImmutableOperationValue(result, `${compiled.operation.name}.result`)
			return result
		} catch (error: unknown) {
			if (isPluginError(error)) {
				if (compiled.operation.errors.includes(error.code)) throw error
				throw operationFailure(
					compiled,
					'operation-plugin-error-undeclared',
					`Operation ${compiled.operation.name} threw undeclared plugin error ${error.code}.`,
					error,
					owned.contributionId,
				)
			}
			if (error instanceof FrameworkError) throw error
			throw operationFailure(
				compiled,
				'operation-handler-failed',
				`Operation ${compiled.operation.name} handler failed.`,
				error,
				owned.contributionId,
			)
		}
	}

	/** Resolves one binding only after explicit application exposure selects it. */
	transportBinding(
		compiled: CompiledPluginOperation,
		transport: OperationTransportProtocol,
	): OwnedTransportBinding {
		const binding = this.#transportBindings
			.get(transport)
			?.get(compiled.operation)
		if (binding === undefined) {
			throw operationFailure(
				compiled,
				'operation-transport-binding-missing',
				`Operation ${compiled.operation.name} has no binding for ${transport.name}@${transport.version}.`,
			)
		}
		return binding
	}

	decode(binding: OwnedTransportBinding, value: unknown): unknown {
		const codec = getOperationWireCodec(binding.binding.codec)
		if (codec === undefined) {
			throw new TypeError('Operation transport codec is unavailable')
		}
		return runWithApplicationPluginOwner(this.application, binding.owner, () =>
			codec.decode(value),
		)
	}

	encode(binding: OwnedTransportBinding, value: unknown): Promise<unknown> {
		const codec = getOperationWireCodec(binding.binding.codec)
		if (codec === undefined) {
			throw new TypeError('Operation transport codec is unavailable')
		}
		return Promise.resolve(
			runWithApplicationPluginOwner(this.application, binding.owner, () =>
				codec.encode(value),
			),
		)
	}
}
