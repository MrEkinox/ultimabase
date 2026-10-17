import type { Pointer, PointerValue } from '../../schema/relations/pointer.js'
import type {
	Register,
	RegisteredSchemaNameWithKey,
} from '../../schema/schema/registered-schemas.js'

declare const principalSchemaMarker: unique symbol

/**
 * Designates the schema whose rows identify request callers, such as the User
 * schema of an authentication plugin (ADR-0340). A plugin adds it to the
 * statics of the one schema it designates; `Principal` then points to that
 * schema without a `principal` key in `Register`. Type-only: no runtime value
 * carries the marker.
 *
 * @example
 * ```ts
 * interface UserStaticsSlot extends SchemaStaticsHKT {
 *   readonly statics: 'UserSchema' extends keyof this['shape']
 *     ? UserStatics & PrincipalSchemaCarrier
 *     : unknown
 * }
 * ```
 */
export interface PrincipalSchemaCarrier {
	readonly [principalSchemaMarker]?: true
}

type PrincipalPointer<TClassName> = [TClassName] extends [never]
	? PointerValue
	: Pointer<Extract<TClassName, string>>

/**
 * The authenticated identity of the current request: a Core `Pointer` to a row
 * of the authentication provider's identity schema, or `undefined` when the
 * caller is anonymous (ADR-0304). Core owns no user schema, session or
 * credential; authority stays `anonymous` or `master`.
 *
 * Once `Register` names the application, it points to the schema an installed
 * plugin designates through `PrincipalSchemaCarrier`, such as the User schema
 * of the authentication plugin (ADR-0340). An application that identifies
 * callers differently names that schema with the `principal` key of
 * `Register`, which wins. Otherwise it is typed as `PointerValue` (any
 * pointer).
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
	: PrincipalPointer<RegisteredSchemaNameWithKey<typeof principalSchemaMarker>>

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
 * @example `.with({ access: { create: isAuthenticated } })`
 */
export const isAuthenticated: PolicyPredicate = function isAuthenticated({
	principal,
}: PolicyContext): boolean {
	return principal !== undefined
}
