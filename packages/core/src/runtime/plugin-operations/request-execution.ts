import type {
	ApplicationOperationBinding,
	PluginOperationEnvelope,
} from '../../application/application-handles.js'
import type { CompiledPluginOperation } from '../../plugins/application-surface-registry.js'
import type { RequestEngine } from '../engine/framework-engine.js'

type RequestPluginOperationExecutor = (
	compiled: CompiledPluginOperation,
	binding: ApplicationOperationBinding,
	envelope: PluginOperationEnvelope,
) => Promise<unknown>
const requestPluginOperationExecutors = new WeakMap<
	RequestEngine,
	RequestPluginOperationExecutor
>()

/** Installs Core's private execution bridge on one immutable RequestEngine. */
export const registerRequestPluginOperationExecutor = (
	engine: RequestEngine,
	executor: RequestPluginOperationExecutor,
): void => {
	requestPluginOperationExecutors.set(engine, executor)
}

/** Invokes the private bridge without adding low-level methods to the public class. */
export const executeRequestPluginOperation = (
	engine: RequestEngine,
	compiled: CompiledPluginOperation,
	binding: ApplicationOperationBinding,
	envelope: PluginOperationEnvelope,
): Promise<unknown> => {
	const executor = requestPluginOperationExecutors.get(engine)
	if (executor === undefined) {
		throw new TypeError('Request plugin operation execution is unavailable')
	}
	return executor(compiled, binding, envelope)
}
