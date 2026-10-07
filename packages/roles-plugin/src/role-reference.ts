import {
	RequestSubjectReference,
	type DatabaseOperationAst,
	type ExecutableOperationAst,
	type RequestRoleReference,
	type SchemaDefinition,
} from '@ultimabase/core'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
} from '@ultimabase/shared'

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
> = RequestRoleReference & {
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
/** Versions the serialized neutral value so ACL JSON can restore it later. */
const identityPrefix = ['@ultimabase/roles-plugin', 1] as const

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

const normalizeRoleNameValue = (value: unknown): string => {
	if (typeof value !== 'string') {
		throw new TypeError('Role names must be strings')
	}
	return normalizeRoleName(value)
}

const normalizeRoleRecord = (
	value: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> =>
	Object.hasOwn(value, 'name')
		? immutableRecord({ ...value, name: normalizeRoleNameValue(value.name) })
		: value

const normalizeRoleUpdate = (value: unknown): unknown => {
	if (!isPlainRecord(value) || !isUnknownArray(value.operations)) return value

	return immutableRecord({
		...value,
		operations: immutableArray(
			value.operations.map((operation) =>
				isPlainRecord(operation) &&
				operation.field === 'name' &&
				Object.hasOwn(operation, 'value')
					? immutableRecord({
							...operation,
							value: normalizeRoleNameValue(operation.value),
						})
					: operation,
			),
		),
	})
}

/** Stores every written role name in its canonical identity form. */
export const normalizeRoleOperation = <
	const TOperation extends DatabaseOperationAst,
>(
	operation: TOperation,
): TOperation => {
	const executable = operation as unknown as ExecutableOperationAst
	// Only role-name values change; every other operation property is kept.
	const replace = (changes: object): TOperation => {
		const normalized: unknown = immutableRecord({ ...executable, ...changes })
		return normalized as TOperation
	}

	switch (executable.kind) {
		case 'create-one':
			return replace({ input: normalizeRoleRecord(executable.input) })
		case 'create-many':
			return replace({
				inputs: immutableArray(executable.inputs.map(normalizeRoleRecord)),
			})
		case 'update-one':
		case 'update-many':
			return replace({ update: normalizeRoleUpdate(executable.update) })
		case 'upsert-one':
			return replace({
				create: normalizeRoleRecord(executable.create),
				update: normalizeRoleUpdate(executable.update),
			})
		case 'upsert-many':
			return replace({
				items: immutableArray(
					executable.items.map((item) =>
						immutableRecord({
							...item,
							create: normalizeRoleRecord(item.create),
							update: normalizeRoleUpdate(item.update),
						}),
					),
				),
			})
		default:
			return operation
	}
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
	const reference = new RequestSubjectReference(
		'role',
		JSON.stringify([...identityPrefix, schema.className, normalizedSelector]),
	)

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
	reference: RequestRoleReference,
): RoleReferenceState | undefined
export function getRoleReferenceState(
	reference: RequestRoleReference,
): RoleReferenceState | undefined {
	return roleReferenceStates.get(reference)
}

/** Reads the single-key selector object of a serialized reference. */
const readSerializedSelector = (value: unknown): RoleSelector | undefined => {
	if (!isPlainRecord(value) || Object.keys(value).length !== 1) {
		return undefined
	}

	if (typeof value.id === 'string') return { id: value.id }

	return typeof value.name === 'string' ? { name: value.name } : undefined
}

/** Restores official role state from the stable neutral value retained by ACL JSON. */
export const restoreRoleReferenceState = (
	reference: RequestRoleReference,
	registeredSchemas: ReadonlySet<SchemaDefinition>,
): RoleReferenceState | undefined => {
	let value: unknown

	try {
		value = JSON.parse(reference.value)
	} catch {
		return undefined
	}

	if (
		!isUnknownArray(value) ||
		value.length !== 4 ||
		value[0] !== identityPrefix[0] ||
		value[1] !== identityPrefix[1] ||
		typeof value[2] !== 'string'
	) {
		return undefined
	}

	const className = value[2]
	const selector = readSerializedSelector(value[3])

	if (selector === undefined) return undefined

	const schema = [...registeredSchemas].find(
		(candidate) => candidate.className === className,
	)

	if (schema === undefined) return undefined

	try {
		return Object.freeze({ schema, selector: normalizeRoleSelector(selector) })
	} catch {
		return undefined
	}
}
