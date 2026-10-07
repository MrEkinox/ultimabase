import { FrameworkError } from '../../errors/framework-error.js'
import { readApplicationKernelState } from '../../application/application-kernel-state.js'
import type { PluginIdentity } from '../../plugins/manifest.js'
import type { RequestEngine } from '../engine/framework-engine.js'
import { readRequestEngineInternals } from '../engine/request-engine.js'
import { readPipelineTransactionAdapter } from '../transactions/pipeline-transaction.js'
import { createAdapterAccess, type AdapterAccess } from './raw-access.js'

/** @internal Creates an operation-owner view over one active transaction adapter. */
export const createRequestAdapterAccess = (
	engine: RequestEngine,
	owner: PluginIdentity,
): AdapterAccess => {
	const { application, lifetime, pipeline } = readRequestEngineInternals(engine)
	const state = readApplicationKernelState(application)

	return createAdapterAccess({
		assertPrivilege: (privilege) => {
			state.assertPrivilege(owner, privilege)
		},
		capabilities: state.pluginCapabilities(owner),
		isOpen: (): boolean => {
			lifetime?.assertActive()
			return true
		},
		scope: () => {
			const adapter = readPipelineTransactionAdapter(pipeline)
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
