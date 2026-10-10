import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import { applyUpdateExpressionToRecord } from '../../query/updates/apply.js'
import type { DatabaseOperationAst } from '../database/contracts.js'
import type { DatabasePersistencePlan } from './contracts.js'

const applyToRecord = (
	plan: DatabasePersistencePlan,
	record: unknown,
): unknown => {
	if (!isPlainRecord(record) || !('update' in plan.data)) return record
	const updated = applyUpdateExpressionToRecord(
		plan.target.schema.definition,
		record,
		plan.data.update,
	)
	// The result keeps its selection: only already selected fields change.
	return immutableRecord(
		Object.fromEntries(
			Object.keys(record).map((field) => [field, updated[field]]),
		),
	)
}

/**
 * A logical delete that a plugin rewrote into an update (Soft Delete) returns
 * the row as it stands after the write, like `softDelete`; its read rules were
 * checked on the pre-image (ADR-0306, step 2 amendment). A physical delete
 * keeps returning its pre-image.
 */
export const readRewrittenDeleteResult = <TResult>(
	operation: DatabaseOperationAst,
	plan: DatabasePersistencePlan,
	result: TResult,
): TResult => {
	const rewritten =
		(operation.kind === 'delete-one' && plan.kind === 'update-one') ||
		(operation.kind === 'delete-many' && plan.kind === 'update-many')
	if (!rewritten) return result
	const candidate: unknown = result
	// The same records with the rewrite's values: the result keeps its shape.
	return (
		Array.isArray(candidate)
			? immutableArray(candidate.map((record) => applyToRecord(plan, record)))
			: applyToRecord(plan, candidate)
	) as TResult
}
