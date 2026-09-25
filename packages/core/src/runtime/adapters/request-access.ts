import { FrameworkError } from '../../errors/framework-error.js'
import { readApplicationKernelState } from '../../application/application-kernel-state.js'
import type { PluginIdentity } from '../../plugins/manifest.js'
import type { RequestEngine } from '../engine/framework-engine.js'
import type { RuntimePipeline } from '../pipeline/runtime-pipeline.js'
import { readPipelineTransactionAdapter } from '../transactions/pipeline-transaction.js'
import type { TransactionLifetime } from '../transactions/transaction-lifetime.js'
import { createAdapterAccess, type AdapterAccess } from './raw-access.js'

interface RequestAdapterAccessContext {
	readonly pipeline: RuntimePipeline
	readonly transactionLifetime?: TransactionLifetime
}

const requestContexts = new WeakMap<
	RequestEngine,
	RequestAdapterAccessContext
>()

/** @internal Binds private transaction state without widening RequestEngine. */
export const registerRequestAdapterAccessContext = (
	engine: RequestEngine,
	pipeline: RuntimePipeline,
	transactionLifetime?: TransactionLifetime,
): void => {
	if (requestContexts.has(engine)) {
		throw new TypeError('Request adapter access context is already registered')
	}
	requestContexts.set(engine, {
		pipeline,
		...(transactionLifetime === undefined ? {} : { transactionLifetime }),
	})
}

/** @internal Creates an operation-owner view over one active transaction adapter. */
export const createRequestAdapterAccess = (
	engine: RequestEngine,
	owner: PluginIdentity,
): AdapterAccess => {
	const request = requestContexts.get(engine)
	if (request === undefined) {
		throw new TypeError('Request adapter access context is unavailable')
	}
	const capabilities = readApplicationKernelState(
		engine.application,
	).pluginCapabilities(owner)

	return createAdapterAccess({
		assertPrivilege: (privilege) => {
			readApplicationKernelState(engine.application).assertPrivilege(
				owner,
				privilege,
			)
		},
		capabilities,
		isOpen: (): boolean => {
			request.transactionLifetime?.assertActive()
			return true
		},
		scope: () => {
			const adapter = readPipelineTransactionAdapter(request.pipeline)
			if (adapter === undefined) {
				throw new FrameworkError(
					'PLUGIN_ADAPTER_CAPABILITY_MISSING',
					'Raw adapter access requires an active transaction lease.',
					{
						publicMessage: 'The requested adapter capability is not available.',
						internalDetails: { reason: 'raw-adapter-transaction-required' },
					},
				)
			}
			return { adapter, kind: 'transaction' as const }
		},
	})
}
