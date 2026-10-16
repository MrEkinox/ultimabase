import type { Pointer, PointerValue } from '../../schema/relations/pointer.js'
import type { Register } from '../../schema/schema/registered-schemas.js'

/**
 * The authenticated identity of the current request: a Core `Pointer` to a row
 * of the authentication provider's identity schema, or `undefined` when the
 * caller is anonymous (ADR-0304). Core owns no user schema, session or
 * credential; authority stays `anonymous` or `master`.
 *
 * Without `Register` it is typed as `PointerValue` (any pointer). Name the
 * identity schema once in `Register` to type it by name:
 *
 * @example
 * ```ts
 * declare module '@ultimabase/core' {
 *   interface Register {
 *     readonly app: typeof ultimabase
 *     readonly principal: 'TodoUser'
 *   }
 * }
 * // principal: Pointer<"TodoUser"> | undefined
 * ```
 */
export type Principal = Register extends {
	readonly principal: infer TClassName extends string
}
	? Pointer<TClassName>
	: PointerValue

/**
 * Policy operation keys: the reads `one`, `many`, `count` and `exists`, the
 * writes `create`, `update`, `upsert` and `delete`, and plugin mutation keys
 * such as `softDeleteOne`.
 */
export type PolicyOperation =
	| 'one'
	| 'many'
	| 'count'
	| 'exists'
	| 'create'
	| 'update'
	| 'upsert'
	| 'delete'
	| (string & {})

/** What a policy predicate may read: who asks, for which operation and schema. */
export interface PolicyContext {
	/** The current request's principal, `undefined` when anonymous. */
	readonly principal: Principal | undefined
	/** The operation being decided, for example `update` or `softDeleteOne`. */
	readonly operation: PolicyOperation
	/** The class name of the schema being decided. */
	readonly schema: string
}

/**
 * A boolean decision that needs no row filter, accepted by Access rules and
 * other policy plugins (ADR-0304). Write it as a named, side-effect-free
 * function: Core may call it several times (retries, `can()`), and a predicate
 * that throws rejects the operation.
 *
 * @example
 * ```ts
 * const isEditor: PolicyPredicate = function isEditor({ principal }) {
 *   return principal !== undefined && editors.has(principal.id)
 * }
 * ```
 */
export type PolicyPredicate = (
	context: PolicyContext,
) => boolean | Promise<boolean>

/**
 * Allows any authenticated caller: `principal !== undefined`.
 *
 * @example `.with((plugins) => plugins.access({ create: isAuthenticated }))`
 */
export const isAuthenticated: PolicyPredicate = function isAuthenticated({
	principal,
}: PolicyContext): boolean {
	return principal !== undefined
}
