import type { OperationAstNode } from '../../query/index.js'
import type { SchemaDefinition } from '../../schema/index.js'
import { isProtectedPolicyDenied } from '../enforcement/protected-denial.js'

/** Builds a stable master audit reason from the normalized schema operation. */
export const createMasterAuditReason = (
	operation: OperationAstNode,
	schema: SchemaDefinition,
): string => `Schema command ${operation.kind} on ${schema.className}`

/** Recognizes only Runtime's unforgeable protected-policy denial marker. */
export const isProtectedPolicyDenial: (error: unknown) => boolean =
	isProtectedPolicyDenied

/** Identifies operations whose private object identity must never resolve to null. */
export const isStrictObjectOperation = (operation: OperationAstNode): boolean =>
	operation.kind === 'get' ||
	operation.kind === 'update-one' ||
	operation.kind === 'delete-one'
