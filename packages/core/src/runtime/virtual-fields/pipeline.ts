import { FrameworkError } from '../../foundation.js'
import type {
	DatabaseOperationAst,
	DatabaseOperationResult,
} from '../database/contracts.js'
import type { RuntimeBehaviorBoundaries } from '../behaviors/validation-boundaries.js'
import {
	prepareRuntimeVirtualFieldProjection,
	projectRuntimePublicPersistedResult,
	type RuntimeVirtualFieldProjection,
} from './projection.js'
import type { RuntimeVirtualFieldScheduler } from './execution.js'

/** Fails closed when a custom Runtime lost its application resolver binding. */
export const prepareBoundRuntimeVirtualFieldProjection = (
	operation: DatabaseOperationAst,
	scheduler: RuntimeVirtualFieldScheduler | undefined,
): RuntimeVirtualFieldProjection | undefined => {
	const projection = prepareRuntimeVirtualFieldProjection(operation)
	if (projection !== undefined && scheduler === undefined) {
		throw new FrameworkError(
			'INTERNAL_ERROR',
			'Runtime virtual fields are not application-bound.',
			{ publicMessage: 'The operation could not be completed.' },
		)
	}
	return projection
}

/** Snapshots the private superset and derives its dependency-free public view. */
export const prepareRuntimeVirtualDatabaseResult = <
	const TOperation extends DatabaseOperationAst,
>(
	boundaries: RuntimeBehaviorBoundaries,
	operation: TOperation,
	projection: RuntimeVirtualFieldProjection | undefined,
	result: DatabaseOperationResult<TOperation>,
): Readonly<{
	readonly privateResult: DatabaseOperationResult<TOperation>
	readonly publicResult: DatabaseOperationResult<TOperation>
}> => {
	if (projection === undefined) {
		return { privateResult: result, publicResult: result }
	}
	const privateResult = boundaries.snapshotDatabaseResultReplacement(
		operation,
		result,
		projection.persistedSelection.fields.map(({ field }) => field),
	)
	return {
		privateResult,
		publicResult: projectRuntimePublicPersistedResult(
			projection,
			privateResult,
		),
	}
}
