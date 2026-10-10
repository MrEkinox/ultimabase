import { immutableRecord } from '@ultimabase/shared'

import { FrameworkError } from '../errors/framework-error.js'
import { readApplicationPluginOwner } from '../plugins/callback-execution.js'
import { readApplicationKernelState } from '../application/application-kernel-state.js'
import { databaseAdapterCapability } from '../runtime/database/contracts.js'
import { getActiveRequestEngine } from '../runtime/context/active-framework-context.js'
import { readRequestEngineInternals } from '../runtime/engine/request-engine.js'
import type { RequestEngine } from '../runtime/engine/framework-engine.js'
import { readPipelineTransactionAdapter } from '../runtime/transactions/pipeline-transaction.js'
import { throwIfOperationCancelled } from '../runtime/cancellation/operation-cancellation.js'
import type { PrivateCollection, PrivateCollectionHandle } from './contracts.js'
import {
	readRegisteredPrivateStorageAdapter,
	type PrivateStorageDatabaseAdapter,
	type PrivateStorageOperationKind,
	type PrivateStorageOperationRequest,
} from './adapter.js'
import type { PrivateStorageRegistry } from './registry.js'
import {
	normalizePrivateStorageRequest,
	snapshotPrivateStorageResult,
} from './request.js'

const missingAdapter = (
	message: string,
	kind: string,
): FrameworkError<'PLUGIN_ADAPTER_CAPABILITY_MISSING'> =>
	new FrameworkError('PLUGIN_ADAPTER_CAPABILITY_MISSING', message, {
		internalDetails: { kind },
	})

/** Mutations open the automatic transaction; reads use the root adapter. */
const executeOnRequest = async (
	engine: RequestEngine,
	request: PrivateStorageOperationRequest,
): Promise<Readonly<Record<string, unknown>> | null> => {
	const { application, automaticTransaction, lifetime, pipeline } =
		readRequestEngineInternals(engine)
	throwIfOperationCancelled(engine.context.signal, { phase: 'private-storage' })
	if (request.kind !== 'find-unique' && lifetime === undefined) {
		return automaticTransaction(
			{ operation: `private-storage-${request.kind}` },
			(transaction) => executeOnRequest(transaction, request),
		)
	}
	lifetime?.assertActive()
	const database =
		lifetime === undefined
			? readApplicationKernelState(application).capability(
					databaseAdapterCapability,
				)
			: readPipelineTransactionAdapter(pipeline)
	const executor =
		database === undefined
			? undefined
			: readRegisteredPrivateStorageAdapter(database)
	if (executor === undefined) {
		throw missingAdapter(
			'Database adapter does not implement private storage.',
			'private-storage-adapter-missing',
		)
	}
	const execute = () => executor.executePrivateStorage(request)
	const result = await (lifetime === undefined
		? execute()
		: lifetime.run(execute))
	throwIfOperationCancelled(engine.context.signal, {
		phase: 'private-storage-result',
	})
	return snapshotPrivateStorageResult(request.collection, result)
}

/** @internal Compiles private metadata after capabilities and before plugin setup. */
export const configureApplicationPrivateStorage = async (
	application: object,
	registry: PrivateStorageRegistry,
): Promise<void> => {
	if (registry.size === 0) return
	const adapter = readApplicationKernelState(application).capability(
		databaseAdapterCapability,
	)
	if (adapter === undefined) {
		throw missingAdapter(
			'Private storage requires one database adapter.',
			'private-storage-database-adapter-missing',
		)
	}
	const candidate: Partial<PrivateStorageDatabaseAdapter> | undefined =
		readRegisteredPrivateStorageAdapter(adapter)
	if (typeof candidate?.configurePrivateStorage !== 'function') {
		throw missingAdapter(
			'Database adapter cannot compile owner-private collections.',
			'private-storage-adapter-missing',
		)
	}
	await candidate.configurePrivateStorage(registry.values())
}

/**
 * Opens one opaque collection handle only inside its exact owner's active callback.
 * Every operation rechecks application, owner, privilege, request, and transaction scope.
 */
export const privateStore = <const TCollection extends PrivateCollection>(
	collection: TCollection,
): PrivateCollectionHandle<TCollection> => {
	// Resolve once before materializing the handle so application code cannot retain an empty facade.
	const engine = getActiveRequestEngine()
	const application =
		engine === undefined
			? undefined
			: readRequestEngineInternals(engine).application
	const owner =
		application === undefined
			? undefined
			: readApplicationPluginOwner(application)
	if (application === undefined || owner === undefined) {
		throw new FrameworkError(
			'PLUGIN_PRIVILEGE_DENIED',
			'Private storage handles require an attributed plugin request callback.',
			{ internalDetails: { kind: 'private-storage-handle-owner-missing' } },
		)
	}
	const state = readApplicationKernelState(application)
	state.assertPrivilege(owner, 'storage:private')
	state.privateStorage.resolve(collection, owner)

	const execute = (kind: PrivateStorageOperationKind, options: unknown) => {
		const active = getActiveRequestEngine()
		if (active === undefined) {
			throw new FrameworkError(
				'MISSING_EXECUTION_CONTEXT',
				'Private storage requires an active application request.',
				{ internalDetails: { kind: 'private-storage-request-missing' } },
			)
		}
		const activeApplication = readRequestEngineInternals(active).application
		const activeOwner = readApplicationPluginOwner(activeApplication)
		if (
			activeApplication !== application ||
			activeOwner?.pluginId !== owner.pluginId ||
			activeOwner.instanceId !== owner.instanceId
		) {
			throw new FrameworkError(
				'PLUGIN_PRIVILEGE_DENIED',
				'Private storage requires its exact application and plugin instance.',
				{ internalDetails: { kind: 'private-storage-handle-owner-mismatch' } },
			)
		}
		state.assertPrivilege(owner, 'storage:private')
		return executeOnRequest(
			active,
			normalizePrivateStorageRequest(
				state.privateStorage.resolve(collection, owner),
				kind,
				options,
			),
		)
	}

	return immutableRecord({
		findUnique: (options) => execute('find-unique', options),
		insert: async (options) => {
			const result = await execute('insert', options)
			if (result === null) {
				throw new TypeError('Private storage insert returned no record')
			}
			return result
		},
		update: (options) => execute('update', options),
		delete: (options) => execute('delete', options),
		compareAndSwap: (options) => execute('compare-and-swap', options),
	}) as PrivateCollectionHandle<TCollection>
}
