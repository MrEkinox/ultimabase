import { immutableRecord } from '@ultimabase/shared'

import { runApplicationWork } from '../../application/active-application.js'
import type { PluginOperationEnvelope } from '../../application/application-handles.js'
import { readApplicationKernelState } from '../../application/application-kernel-state.js'
import { FrameworkError } from '../../errors/framework-error.js'
import { PluginError } from '../../errors/plugin-error.js'
import { PublicError } from '../../errors/public-error.js'
import { runWithApplicationPluginOwner } from '../../plugins/callback-execution.js'
import type {
	CompiledCommand,
	CompiledOperationCommand,
} from '../../plugins/command-graph.js'
import { formatPluginIdentity } from '../../plugins/manifest.js'
import { throwIfOperationCancelled } from '../cancellation/operation-cancellation.js'
import { runWithRequestEngineScope } from '../context/active-framework-context.js'
import type { RequestEngine } from '../engine/framework-engine.js'
import { readRequestEngineInternals } from '../engine/request-engine.js'

/** Reports one plugin command failure without exposing its owner publicly. */
export const commandFailure = (
	command: CompiledCommand,
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
			operation: command.definition.name,
			plugin: formatPluginIdentity(command.owner),
			...(contributionId === undefined ? {} : { contributionId }),
		},
	})

const isPluginError = (error: unknown): error is PluginError =>
	error instanceof PluginError

/** Invokes one handler and enforces its result and public error contracts. */
const executeOperationHandler = async (
	engine: RequestEngine,
	compiled: CompiledOperationCommand,
	envelope: PluginOperationEnvelope,
): Promise<unknown> => {
	const { application } = readRequestEngineInternals(engine)
	const graph = readApplicationKernelState(application).commands
	const owned = graph.bindings.handler(compiled)
	const name = compiled.definition.name
	if (owned?.kind !== 'operation') {
		throw commandFailure(
			compiled,
			'operation-handler-missing',
			`Operation ${name} has no installed handler.`,
		)
	}
	try {
		const candidate = await runWithApplicationPluginOwner(
			application,
			owned.owner,
			() =>
				owned.execute(
					immutableRecord({
						context: engine.context,
						engine,
						input: envelope.payload,
						owner: owned.owner,
						target: immutableRecord({ kind: 'application' as const }),
					}),
				),
		)
		return graph.snapshotOperationResult(compiled, candidate)
	} catch (error: unknown) {
		if (isPluginError(error)) {
			if (compiled.definition.errors.includes(error.code)) throw error
			throw commandFailure(
				compiled,
				'operation-plugin-error-undeclared',
				`Operation ${name} threw undeclared plugin error ${error.code}.`,
				error,
				owned.contributionId,
			)
		}
		if (error instanceof FrameworkError || error instanceof PublicError) {
			throw error
		}
		throw commandFailure(
			compiled,
			'operation-handler-failed',
			`Operation ${name} handler failed.`,
			error,
			owned.contributionId,
		)
	}
}

/** Enforces envelope identity, cancellation, and transaction policy around one handler. */
const executeOperationRequest = async (
	engine: RequestEngine,
	compiled: CompiledOperationCommand,
	envelope: PluginOperationEnvelope,
): Promise<unknown> => {
	const { application, automaticTransaction, lifetime } =
		readRequestEngineInternals(engine)
	const { definition } = compiled
	const targetKind: unknown = envelope.target.kind
	if (
		readApplicationKernelState(application).commands.get(definition.name) !==
			compiled ||
		envelope.name !== definition.name ||
		envelope.version !== definition.version ||
		envelope.transaction !== definition.transaction ||
		targetKind !== 'application'
	) {
		throw new FrameworkError(
			'PLUGIN_OPERATION_INVALID',
			'Plugin operation envelope does not match the installed declaration.',
			{
				publicMessage: 'The requested operation is not available.',
				internalDetails: {
					kind: 'operation-envelope-mismatch',
					operation: definition.name,
				},
			},
		)
	}
	throwIfOperationCancelled(engine.context.signal, {
		phase: 'plugin-operation',
	})

	if (definition.transaction === 'required' && lifetime === undefined) {
		return automaticTransaction({ operation: definition.name }, (transaction) =>
			executeRequestPluginOperation(transaction, compiled, envelope),
		)
	}
	if (definition.transaction === 'forbidden' && lifetime !== undefined) {
		const error = new FrameworkError(
			'TRANSACTION_ERROR',
			`Operation ${definition.name} forbids an active transaction.`,
			{
				publicMessage: 'The operation cannot run in this transaction.',
				internalDetails: { reason: 'plugin-operation-transaction-forbidden' },
			},
		)
		lifetime.markFailed(error)
		throw error
	}

	const execute = () =>
		runWithRequestEngineScope(engine, () =>
			executeOperationHandler(engine, compiled, envelope),
		)
	const result = await (lifetime === undefined
		? execute()
		: lifetime.run(execute))
	throwIfOperationCancelled(engine.context.signal, {
		phase: 'plugin-operation-result',
	})
	return result
}

/** Executes one plugin operation through Core without widening RequestEngine. */
export const executeRequestPluginOperation = (
	engine: RequestEngine,
	compiled: CompiledOperationCommand,
	envelope: PluginOperationEnvelope,
): Promise<unknown> =>
	runApplicationWork(readRequestEngineInternals(engine).application, () =>
		executeOperationRequest(engine, compiled, envelope),
	)
