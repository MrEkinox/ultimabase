import { immutableRecord } from '@ultimabase/shared'

import { readLinkTargetOperation } from '../../schema/nested-writes/operation-markers.js'
import type { RequestContext } from '../context/request-context.js'
import type { DatabaseOperationAst } from '../database/contracts.js'
import { isProtectedPolicyDenied } from '../enforcement/protected-denial.js'
import {
	createProtectedObjectNotFoundError,
	withLinkTargetNotFound,
} from '../operations/target-errors.js'
import type { RuntimePipelineRequest } from '../pipeline/contracts.js'
import { createRelationTargetLookup } from '../relations/relation-mutation.js'

/**
 * Checks before the write, in its transaction, that each `connect` target of
 * a collection command is visible to the caller as a single-row read; Master
 * checks existence only (ADR-0308).
 */
export const verifyRuntimeLinkTargets = async (
	context: RequestContext,
	operation: DatabaseOperationAst,
	execute: (
		request: RuntimePipelineRequest<DatabaseOperationAst>,
	) => Promise<unknown>,
): Promise<void> => {
	for (const { field, pointer } of readLinkTargetOperation(operation) ?? []) {
		const lookup = createRelationTargetLookup(pointer)
		await withLinkTargetNotFound(field, pointer.schema.className, async () => {
			let target: unknown
			try {
				target = await execute(
					immutableRecord({
						context,
						operation: lookup.operation,
						protectedPolicyDeniedAsMissing: true as const,
						rowFilter: lookup.rowFilter,
					}),
				)
			} catch (error: unknown) {
				if (isProtectedPolicyDenied(error)) {
					throw createProtectedObjectNotFoundError()
				}
				throw error
			}
			if (target === null) throw createProtectedObjectNotFoundError()
		})
	}
}
