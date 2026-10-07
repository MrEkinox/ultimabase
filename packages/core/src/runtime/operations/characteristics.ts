import { immutableArray, isUnknownArray } from '@ultimabase/shared'

import type {
	ExecutableOperationAst,
	OperationKind,
} from '../../query/index.js'
import type {
	DatabaseMutationOperationAst,
	DatabaseOperationAst,
} from '../database/contracts.js'
import type { RuntimeLogicalOperationKind } from '../pipeline/contracts.js'

const runtimeOperationKinds: ReadonlySet<string> =
	new Set<RuntimeLogicalOperationKind>([
		'find-many',
		'find-one',
		'get',
		'count',
		'exists',
		'create-one',
		'create-many',
		'update-one',
		'update-many',
		'upsert-one',
		'upsert-many',
		'delete-one',
		'delete-many',
		'plugin-schema-mutation',
	])

const isRuntimeLogicalOperationKind = (
	value: unknown,
): value is RuntimeLogicalOperationKind =>
	typeof value === 'string' && runtimeOperationKinds.has(value)

/** Validates one optional, non-empty and de-duplicated terminal filter of a definition. */
export const normalizeRuntimeOperationKinds = (
	operations: readonly RuntimeLogicalOperationKind[] | undefined,
	owner: 'enforcement' | 'runtime',
): readonly RuntimeLogicalOperationKind[] | undefined => {
	if (operations === undefined) return undefined

	const untrustedOperations: unknown = operations
	if (
		!isUnknownArray(untrustedOperations) ||
		untrustedOperations.length === 0
	) {
		throw new TypeError(
			`${owner} contribution operations must be a non-empty array`,
		)
	}

	const normalized: RuntimeLogicalOperationKind[] = []
	for (const operation of untrustedOperations) {
		if (!isRuntimeLogicalOperationKind(operation)) {
			throw new TypeError(
				`Unknown ${owner} operation kind: ${String(operation)}`,
			)
		}
		if (!normalized.includes(operation)) normalized.push(operation)
	}

	return immutableArray(normalized)
}

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
