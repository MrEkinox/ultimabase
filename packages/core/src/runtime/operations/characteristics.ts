import type {
	ExecutableOperationAst,
	OperationKind,
} from '../../query/index.js'
import type {
	DatabaseMutationOperationAst,
	DatabaseOperationAst,
} from '../database/contracts.js'

const readOperationKinds: ReadonlySet<OperationKind> = new Set([
	'count',
	'exists',
	'find-many',
	'find-one',
	'get',
])

const scalarResultKinds: ReadonlySet<OperationKind> = new Set([
	'count',
	'exists',
])

const nullableResultKinds: ReadonlySet<OperationKind> = new Set([
	'delete-one',
	'find-one',
	'get',
	'update-one',
])

const collectionResultKinds: ReadonlySet<OperationKind> = new Set([
	'create-many',
	'delete-many',
	'find-many',
	'update-many',
	'upsert-many',
])

const inclusionResultKinds: ReadonlySet<OperationKind> = new Set([
	'create-one',
	'delete-one',
	'find-many',
	'find-one',
	'get',
	'update-one',
	'upsert-one',
])

type QueryBackedOperation = Extract<
	ExecutableOperationAst,
	{ readonly query: unknown }
>

/** Narrows every mutation consumer from the same closed read classification. */
export const isRuntimeMutationOperation = (
	operation: DatabaseOperationAst,
): operation is DatabaseMutationOperationAst =>
	!readOperationKinds.has(operation.kind)

export const isNullableOperationResult = (kind: OperationKind): boolean =>
	nullableResultKinds.has(kind)

export const isCollectionOperationResult = (kind: OperationKind): boolean =>
	collectionResultKinds.has(kind)

export const isRecordOperationResult = (kind: OperationKind): boolean =>
	!scalarResultKinds.has(kind)

export const supportsOperationResultInclusion = (
	kind: OperationKind,
): boolean => inclusionResultKinds.has(kind)

export const isQueryBackedOperation = (
	operation: ExecutableOperationAst,
): operation is QueryBackedOperation => 'query' in operation
