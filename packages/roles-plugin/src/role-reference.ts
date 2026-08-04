import {
	AccessSubjectReference,
	type AccessRoleReference,
	type SchemaDefinition,
} from '@ultimabase/core'

/** Selects one stored role by its normalized logical name. */
export interface RoleNameSelector<TName extends string = string> {
	readonly name: TName
}

/** Selects one stored role by its stable persisted UUID. */
export interface RoleIdSelector<TId extends string = string> {
	readonly id: TId
}

/** Names the two explicit role lookup forms without guessing string semantics. */
export type RoleSelector = RoleNameSelector | RoleIdSelector

declare const roleReferenceType: unique symbol

/**
 * Carries one immutable, schema-qualified stored-role reference into Access.
 *
 * The public value remains Core's neutral role subject. Its nominal type keeps
 * references from independent role schemas incompatible at compile time.
 */
export type RoleReference<
	TSchema extends SchemaDefinition = SchemaDefinition,
	TSelector extends RoleSelector = RoleSelector,
> = AccessRoleReference & {
	readonly [roleReferenceType]: Readonly<{
		readonly schema: TSchema
		readonly selector: TSelector
	}>
}

/** Retains exact schema identity outside the frozen neutral reference shell. */
export interface RoleReferenceState<
	TSchema extends SchemaDefinition = SchemaDefinition,
> {
	readonly schema: TSchema
	readonly selector: RoleSelector
}

const roleReferenceStates = new WeakMap<object, RoleReferenceState>()
const uuidPattern =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu

/** Applies one locale-independent identity form before storage or lookup. */
export const normalizeRoleName = (name: string): string => {
	if (typeof name !== 'string') {
		throw new TypeError('role name must be a string')
	}

	const normalizedName = name.normalize('NFKC').trim().toLowerCase()

	if (normalizedName.length === 0) {
		throw new TypeError('role name must not be empty')
	}

	return normalizedName
}

const normalizeRoleSelector = (selector: RoleSelector): RoleSelector => {
	if ('name' in selector) {
		return Object.freeze({ name: normalizeRoleName(selector.name) })
	}

	if (typeof selector.id !== 'string' || !uuidPattern.test(selector.id)) {
		throw new TypeError('role id must be a UUID')
	}

	return Object.freeze({ id: selector.id.toLowerCase() })
}

/** Creates the neutral reference while preserving package-private lookup state. */
export const createRoleReference = <
	const TSchema extends SchemaDefinition,
	const TSelector extends RoleSelector,
>(
	schema: TSchema,
	selector: TSelector,
): RoleReference<TSchema, TSelector> => {
	const normalizedSelector = normalizeRoleSelector(selector)
	const identity = JSON.stringify([
		'@ultimabase/roles-plugin',
		1,
		schema.className,
		normalizedSelector,
	])
	const reference = new AccessSubjectReference('role', identity)

	roleReferenceStates.set(
		reference,
		Object.freeze({ schema, selector: normalizedSelector }),
	)

	// The private phantom is backed by the WeakMap invariant above.
	return reference as RoleReference<TSchema, TSelector>
}

/** Reads only references created by this package without trusting their payload. */
export function getRoleReferenceState<
	const TSchema extends SchemaDefinition,
	const TSelector extends RoleSelector,
>(
	reference: RoleReference<TSchema, TSelector>,
): RoleReferenceState<TSchema> | undefined
export function getRoleReferenceState(
	reference: AccessRoleReference,
): RoleReferenceState | undefined
export function getRoleReferenceState(
	reference: AccessRoleReference,
): RoleReferenceState | undefined {
	return roleReferenceStates.get(reference)
}
