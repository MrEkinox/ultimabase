import { FrameworkError } from '../../errors/framework-error.js'
import type { OperationAstNode } from '../../query/index.js'
import type { SchemaDefinition } from '../../schema/index.js'

/** Builds a stable master audit reason from the normalized schema operation. */
export const createMasterAuditReason = (
	operation: OperationAstNode,
	schema: SchemaDefinition,
): string => `Schema command ${operation.kind} on ${schema.className}`

/** Recognizes only Runtime's own Access denial marker at a protected boundary. */
export const isNativeAccessDenied = (error: unknown): boolean =>
	error instanceof FrameworkError &&
	error.code === 'PERMISSION_DENIED' &&
	error.internalDetails?.kind === 'native-access-denied'

/** Identifies operations whose private object identity must never resolve to null. */
export const isStrictObjectOperation = (operation: OperationAstNode): boolean =>
	operation.kind === 'get' ||
	operation.kind === 'update-one' ||
	operation.kind === 'delete-one'
