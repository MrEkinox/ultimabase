export { definePrivateCollection } from './definition.js'
export { privateStore } from './runtime.js'
export { registerPrivateStorageAdapter } from './adapter.js'
export type {
	DefinePrivateCollectionOptions,
	PrivateCollection,
	PrivateCollectionCompareAndSwapOptions,
	PrivateCollectionDeleteOptions,
	PrivateCollectionFindUniqueOptions,
	PrivateCollectionHandle,
	PrivateCollectionInsert,
	PrivateCollectionInsertOptions,
	PrivateCollectionRecord,
	PrivateCollectionReference,
	PrivateCollectionUniqueIndex,
	PrivateCollectionUniqueWhere,
	PrivateCollectionUpdate,
	PrivateCollectionUpdateOptions,
	PrivateStorageDeclarationRegistrar,
} from './contracts.js'
export type {
	PrivateStorageAdapterCollection,
	PrivateStorageAdapterField,
	PrivateStorageAdapterReference,
	PrivateStorageDatabaseAdapter,
	PrivateStorageOperationExecutor,
	PrivateStorageOperationKind,
	PrivateStorageOperationRequest,
} from './adapter.js'
