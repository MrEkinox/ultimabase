import type { PluginOperationEnvelope } from '../../application/application-handles.js'
import type { CompiledPluginOperation } from '../../plugins/application-surface-registry.js'
import type { RequestEngine } from '../engine/framework-engine.js'
import type { TransactionLifetime } from '../transactions/transaction-lifetime.js'
import { executePluginOperationRequest } from './engine-integration.js'

type RequestPluginOperationExecutor = (
	compiled: CompiledPluginOperation,
	envelope: PluginOperationEnvelope,
) => Promise<unknown>
const requestPluginOperationExecutors = new WeakMap<
	RequestEngine,
	RequestPluginOperationExecutor
>()

interface RequestPluginOperationHostOptions {
	readonly engine: RequestEngine
	readonly runTransaction: (
		handler: (engine: RequestEngine) => Promise<unknown>,
	) => Promise<unknown>
	readonly transactionLifetime?: TransactionLifetime
}

/** Installs Core's private execution bridge on one immutable RequestEngine. */
export const registerRequestPluginOperationExecutor = (
	engine: RequestEngine,
	executor: RequestPluginOperationExecutor,
): void => {
	requestPluginOperationExecutors.set(engine, executor)
}

/** Installs transaction policy around plugin operations without growing RequestEngine. */
export const registerRequestPluginOperationHost = (
	options: RequestPluginOperationHostOptions,
): void => {
	registerRequestPluginOperationExecutor(options.engine, (compiled, envelope) =>
		executePluginOperationRequest({
			compiled,
			engine: options.engine,
			envelope,
			...(options.transactionLifetime === undefined
				? {}
				: { transactionLifetime: options.transactionLifetime }),
			runRequiredTransaction: () =>
				options.runTransaction((transaction) =>
					executeRequestPluginOperation(transaction, compiled, envelope),
				),
		}),
	)
}

/** Invokes the private bridge without adding low-level methods to the public class. */
export const executeRequestPluginOperation = (
	engine: RequestEngine,
	compiled: CompiledPluginOperation,
	envelope: PluginOperationEnvelope,
): Promise<unknown> => {
	const executor = requestPluginOperationExecutors.get(engine)
	if (executor === undefined) {
		throw new TypeError('Request plugin operation execution is unavailable')
	}
	return executor(compiled, envelope)
}
