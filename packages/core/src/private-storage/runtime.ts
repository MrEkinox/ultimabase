import { immutableRecord } from '@ultimabase/shared'

import { FrameworkError } from '../errors/framework-error.js'
import { readApplicationPluginOwner } from '../plugins/callback-execution.js'
import { assertApplicationPluginPrivilege } from '../plugins/setup-registries.js'
import { readApplicationCapability } from '../plugins/application-capability-access.js'
import {
	databaseAdapterCapability,
	type DatabaseAdapter,
} from '../runtime/database/contracts.js'
import { getActiveFrameworkContext } from '../runtime/context/active-framework-storage.js'
import type { RequestEngine } from '../runtime/engine/framework-engine.js'
import type { RuntimePipeline } from '../runtime/pipeline/runtime-pipeline.js'
import type { TransactionLifetime } from '../runtime/transactions/transaction-lifetime.js'
import { readPipelineTransactionAdapter } from '../runtime/transactions/pipeline-transaction.js'
import { throwIfOperationCancelled } from '../runtime/cancellation/operation-cancellation.js'
import type { PrivateCollection, PrivateCollectionHandle } from './contracts.js'
import type {
	PrivateStorageDatabaseAdapter,
	PrivateStorageOperationExecutor,
	PrivateStorageOperationKind,
	PrivateStorageOperationRequest,
} from './adapter.js'
import { readRegisteredPrivateStorageAdapter } from './adapter.js'
import {
	readPrivateStorageRegistry,
	type PrivateStorageRegistry,
} from './registry.js'
import {
	normalizePrivateStorageRequest,
	snapshotPrivateStorageResult,
} from './request.js'

interface PrivateRequestContext {
	readonly pipeline: RuntimePipeline
	readonly transactionLifetime?: TransactionLifetime
}

const requestContexts = new WeakMap<RequestEngine, PrivateRequestContext>()

/** @internal Retains adapter transaction state without widening RequestEngine. */
export const registerRequestPrivateStorageContext = (
	engine: RequestEngine,
	pipeline: RuntimePipeline,
	transactionLifetime?: TransactionLifetime,
): void => {
	if (requestContexts.has(engine))
		throw new TypeError('Private request context is already registered')
	requestContexts.set(engine, {
		pipeline,
		...(transactionLifetime === undefined ? {} : { transactionLifetime }),
	})
}

const assertPrivateExecutor = (
	value: unknown,
): PrivateStorageOperationExecutor => {
	if (
		typeof value !== 'object' ||
		value === null ||
		!('executePrivateStorage' in value) ||
		typeof value.executePrivateStorage !== 'function'
	) {
		throw new FrameworkError(
			'PLUGIN_ADAPTER_CAPABILITY_MISSING',
			'Database adapter does not implement private storage.',
			{ internalDetails: { kind: 'private-storage-adapter-missing' } },
		)
	}
	return value as PrivateStorageOperationExecutor
}

const executeOnRequest = async (
	engine: RequestEngine,
	request: PrivateStorageOperationRequest,
): Promise<Readonly<Record<string, unknown>> | null> => {
	const context = requestContexts.get(engine)
	if (context === undefined)
		throw new TypeError('Private request context is unavailable')
	throwIfOperationCancelled(engine.context.signal, { phase: 'private-storage' })
	const mutation = request.kind !== 'find-unique'
	if (mutation && context.transactionLifetime === undefined) {
		return engine.transaction((transaction) =>
			executeOnRequest(transaction, request),
		)
	}
	context.transactionLifetime?.assertActive()
	const database =
		context.transactionLifetime === undefined
			? readApplicationCapability(engine.application, databaseAdapterCapability)
			: readPipelineTransactionAdapter(context.pipeline)
	const executor = assertPrivateExecutor(
		database === undefined
			? undefined
			: readRegisteredPrivateStorageAdapter(database),
	)
	const execute = () => executor.executePrivateStorage(request)
	const result = await (context.transactionLifetime === undefined
		? execute()
		: context.transactionLifetime.run(execute))
	throwIfOperationCancelled(engine.context.signal, {
		phase: 'private-storage-result',
	})
	return snapshotPrivateStorageResult(request.collection, result)
}

const assertPrivateDatabaseAdapter = (
	adapter: DatabaseAdapter,
): PrivateStorageDatabaseAdapter => {
	const candidate: unknown = readRegisteredPrivateStorageAdapter(adapter)
	if (
		typeof candidate !== 'object' ||
		candidate === null ||
		!('configurePrivateStorage' in candidate) ||
		typeof candidate.configurePrivateStorage !== 'function' ||
		!('executePrivateStorage' in candidate) ||
		typeof candidate.executePrivateStorage !== 'function'
	) {
		throw new FrameworkError(
			'PLUGIN_ADAPTER_CAPABILITY_MISSING',
			'Database adapter cannot compile owner-private collections.',
			{ internalDetails: { kind: 'private-storage-adapter-missing' } },
		)
	}
	return candidate as PrivateStorageDatabaseAdapter
}

/** @internal Compiles private metadata after capabilities and before plugin setup. */
export const configureApplicationPrivateStorage = async (
	application: object,
	registry: PrivateStorageRegistry,
): Promise<void> => {
	if (registry.size === 0) return
	const adapter = readApplicationCapability(
		application,
		databaseAdapterCapability,
	)
	if (adapter === undefined) {
		throw new FrameworkError(
			'PLUGIN_ADAPTER_CAPABILITY_MISSING',
			'Private storage requires one database adapter.',
			{ internalDetails: { kind: 'private-storage-database-adapter-missing' } },
		)
	}
	await assertPrivateDatabaseAdapter(adapter).configurePrivateStorage(
		registry.values(),
	)
}

const executeOwned = (
	application: object,
	owner: Parameters<typeof assertApplicationPluginPrivilege>[1],
	collection: PrivateCollection,
	kind: PrivateStorageOperationKind,
	options: unknown,
): Promise<Readonly<Record<string, unknown>> | null> => {
	const active = getActiveFrameworkContext()
	if (active === undefined) {
		throw new FrameworkError(
			'MISSING_EXECUTION_CONTEXT',
			'Private storage requires an active application request.',
			{ internalDetails: { kind: 'private-storage-request-missing' } },
		)
	}
	const activeOwner = readApplicationPluginOwner(active.application)
	if (
		active.application !== application ||
		activeOwner?.pluginId !== owner.pluginId ||
		activeOwner.instanceId !== owner.instanceId
	) {
		throw new FrameworkError(
			'PLUGIN_PRIVILEGE_DENIED',
			'Private storage requires its exact application and plugin instance.',
			{ internalDetails: { kind: 'private-storage-handle-owner-mismatch' } },
		)
	}
	assertApplicationPluginPrivilege(application, owner, 'storage:private')
	const descriptor = readPrivateStorageRegistry(active.application).resolve(
		collection,
		owner,
	)
	return executeOnRequest(
		active.requestEngine,
		normalizePrivateStorageRequest(descriptor, kind, options),
	)
}

/**
 * Opens one opaque collection handle only inside its exact owner's active callback.
 * Every operation rechecks application, owner, privilege, request, and transaction scope.
 */
export const privateStore = <const TCollection extends PrivateCollection>(
	collection: TCollection,
): PrivateCollectionHandle<TCollection> => {
	// Resolve once before materializing the handle so application code cannot retain an empty facade.
	const active = getActiveFrameworkContext()
	const owner =
		active === undefined
			? undefined
			: readApplicationPluginOwner(active.application)
	if (active === undefined || owner === undefined) {
		throw new FrameworkError(
			'PLUGIN_PRIVILEGE_DENIED',
			'Private storage handles require an attributed plugin request callback.',
			{ internalDetails: { kind: 'private-storage-handle-owner-missing' } },
		)
	}
	assertApplicationPluginPrivilege(active.application, owner, 'storage:private')
	readPrivateStorageRegistry(active.application).resolve(collection, owner)
	const application = active.application
	return immutableRecord({
		findUnique: (options) =>
			executeOwned(application, owner, collection, 'find-unique', options),
		insert: async (options) => {
			const result = await executeOwned(
				application,
				owner,
				collection,
				'insert',
				options,
			)
			if (result === null)
				throw new TypeError('Private storage insert returned no record')
			return result
		},
		update: (options) =>
			executeOwned(application, owner, collection, 'update', options),
		delete: (options) =>
			executeOwned(application, owner, collection, 'delete', options),
		compareAndSwap: (options) =>
			executeOwned(application, owner, collection, 'compare-and-swap', options),
	}) as PrivateCollectionHandle<TCollection>
}
