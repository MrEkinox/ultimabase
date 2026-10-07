import type {
	SchemaValidationPlans,
	ValidationIssuePath,
} from '../../schema/index.js'
import {
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'
import type { DatabaseMutationOperationAst } from '../database/contracts.js'
import { snapshotRuntimeBoundaryRecord } from './result-snapshot.js'
import {
	adapterBoundaryErrorDescription,
	assertExactKeys,
	readOperationSchema,
	throwBoundaryIssue,
} from './validation-boundary-helpers.js'

type MaterializationKind = 'create' | 'delete' | 'update'

const allowedMaterializationKinds = (
	operation: DatabaseMutationOperationAst,
): readonly MaterializationKind[] => {
	switch (operation.kind) {
		case 'create-many':
		case 'create-one':
			return ['create']
		case 'delete-one':
		case 'delete-many':
			return ['delete']
		case 'update-many':
		case 'update-one':
			return ['update']
		case 'upsert-many':
		case 'upsert-one':
			return ['create', 'update']
	}
}

export const snapshotMaterialization = (
	operation: DatabaseMutationOperationAst,
	value: unknown,
	plans: SchemaValidationPlans,
	path: ValidationIssuePath,
): Readonly<Record<string, unknown>> => {
	if (!isPlainRecord(value)) {
		return throwBoundaryIssue(
			path,
			'Materialization must be a plain object',
			adapterBoundaryErrorDescription,
		)
	}

	const allowedKinds = allowedMaterializationKinds(operation)

	if (
		typeof value.kind !== 'string' ||
		!allowedKinds.includes(value.kind as MaterializationKind)
	) {
		return throwBoundaryIssue(
			[...path, 'kind'],
			'Materialization branch is incompatible with the operation terminal',
			adapterBoundaryErrorDescription,
		)
	}

	if (value.kind === 'create') {
		assertExactKeys(
			value,
			['kind', 'current'],
			path,
			adapterBoundaryErrorDescription,
		)

		return immutableRecord({
			current: snapshotRuntimeBoundaryRecord(
				readOperationSchema(operation, ['operation', 'schema']),
				plans,
				value.current,
				[...path, 'current'],
				undefined,
				adapterBoundaryErrorDescription,
				false,
			),
			kind: 'create',
		})
	}

	if (value.kind === 'delete') {
		assertExactKeys(
			value,
			['kind', 'previous'],
			path,
			adapterBoundaryErrorDescription,
		)

		return immutableRecord({
			kind: 'delete',
			previous: snapshotRuntimeBoundaryRecord(
				readOperationSchema(operation, ['operation', 'schema']),
				plans,
				value.previous,
				[...path, 'previous'],
				undefined,
				adapterBoundaryErrorDescription,
				false,
			),
		})
	}

	assertExactKeys(
		value,
		['kind', 'previous', 'current'],
		path,
		adapterBoundaryErrorDescription,
	)

	return immutableRecord({
		current: snapshotRuntimeBoundaryRecord(
			readOperationSchema(operation, ['operation', 'schema']),
			plans,
			value.current,
			[...path, 'current'],
			undefined,
			adapterBoundaryErrorDescription,
			false,
		),
		kind: 'update',
		previous: snapshotRuntimeBoundaryRecord(
			readOperationSchema(operation, ['operation', 'schema']),
			plans,
			value.previous,
			[...path, 'previous'],
			undefined,
			adapterBoundaryErrorDescription,
			false,
		),
	})
}

export const assertOutcomeCardinality = (
	operation: DatabaseMutationOperationAst,
	result: unknown,
	materializations: readonly unknown[],
): void => {
	let expected: number | undefined

	switch (operation.kind) {
		case 'create-one':
		case 'upsert-one':
			expected = 1
			break
		case 'delete-one':
		case 'update-one':
			expected = result === null ? 0 : 1
			break
		case 'delete-many':
		case 'update-many':
			if (materializations.length === 0) return
			expected = isUnknownArray(result) ? result.length : undefined
			break
		case 'create-many':
		case 'upsert-many':
			expected = isUnknownArray(result) ? result.length : undefined
			break
	}

	if (expected !== undefined && materializations.length !== expected) {
		throwBoundaryIssue(
			['outcome', 'materializations'],
			`Expected ${String(expected)} materialization(s) for ${operation.kind}`,
			adapterBoundaryErrorDescription,
		)
	}
}
