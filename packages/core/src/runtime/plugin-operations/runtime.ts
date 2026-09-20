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
import { readApplicationCommandGraph } from '../../plugins/application-command-graph.js'
import type { CommandBindings } from '../commands/bindings.js'
import type { CompiledPluginOperation } from '../../plugins/application-surface-registry.js'
import { runWithApplicationPluginOwner } from '../../plugins/callback-execution.js'
import { formatPluginIdentity } from '../../plugins/manifest.js'
import { assertImmutableOperationValue } from '../../plugins/plugin-operation-boundaries.js'
import type { SchemaDefinition } from '../../schema/index.js'
import { createRequestAdapterAccess } from '../adapters/request-access.js'
import type { RequestEngine } from '../engine/framework-engine.js'
import { getOperationWireCodec } from './capabilities.js'
import type {
	OperationTransportBindingDefinition,
	OperationTransportProtocol,
	PluginOperationExecutionTarget,
} from './contracts.js'

export interface OwnedTransportBinding {
	readonly binding: OperationTransportBindingDefinition
	readonly contributionId: string
	readonly owner: ApplicationContributionOwner
}

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
	readonly #bindings: CommandBindings

	constructor(
		private readonly application: FrameworkApplication<
			readonly SchemaDefinition[],
			readonly PluginDefinition[]
		>,
	) {
		// Binding ownership is decided once during application materialization.
		this.#bindings = readApplicationCommandGraph(application).bindings
	}

	/** Invokes one handler and enforces its result and public error contracts. */
	async execute(
		engine: RequestEngine,
		compiled: CompiledPluginOperation,
		envelope: PluginOperationEnvelope,
	): Promise<unknown> {
		const owned = this.#bindings.handler(compiled.operation)
		if (owned?.kind !== 'operation') {
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
		const binding = this.#bindings.transport(compiled.operation, transport)
		if (binding?.kind !== 'operation') {
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
