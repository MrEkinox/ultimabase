import { assertNonEmptyString, immutableRecord } from '@ultimabase/shared'

import { assertExactPlainObject } from '../../exact-object-validation.js'
import { snapshotJsonValue, type JsonValue } from '../fields/builtins/json.js'

/** Describes one adapter-neutral versioned logical schema constraint. */
export interface SchemaConstraintDefinition<
	TKind extends string = string,
	TVersion extends number = number,
	TValue extends JsonValue = JsonValue,
> {
	/** Uses a lowercase dot-separated namespace owned by the defining plugin. */
	readonly kind: TKind
	/** Carries callback-free portable data interpreted by an authorized compiler. */
	readonly value: TValue
	/** Versions the logical contract independently from a plugin package release. */
	readonly version: TVersion
}

const constraintKindPattern = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/u
const schemaConstraints = new WeakSet<object>()

/**
 * Keeps schema constraints, database constraint nodes and compiler identities
 * aligned on one namespaced-kind grammar.
 */
export const assertConstraintKind: (
	value: unknown,
	path: string,
) => asserts value is string = (value, path) => {
	assertNonEmptyString(value, path)

	if (!constraintKindPattern.test(value)) {
		throw new TypeError(
			`${path} must use lowercase dot-separated namespace segments`,
		)
	}
}

/** Creates one nominal immutable portable constraint for schema patches. */
export const defineSchemaConstraint = <
	const TKind extends string,
	const TVersion extends number,
	const TValue extends JsonValue,
>(
	definition: SchemaConstraintDefinition<TKind, TVersion, TValue>,
): SchemaConstraintDefinition<TKind, TVersion, TValue> => {
	assertExactPlainObject(
		definition,
		new Set(['kind', 'value', 'version']),
		'Schema constraint must be a plain object',
		'Unknown schema constraint key: ',
	)

	assertConstraintKind(definition.kind, 'Schema constraint kind')
	if (!Number.isSafeInteger(definition.version) || definition.version < 1) {
		throw new RangeError(
			'Schema constraint version must be a positive safe integer',
		)
	}

	const constraint = immutableRecord({
		kind: definition.kind,
		value: snapshotJsonValue(definition.value, 'Schema constraint value'),
		version: definition.version,
	}) as SchemaConstraintDefinition<TKind, TVersion, TValue>

	schemaConstraints.add(constraint)

	return constraint
}

/** Proves that a constraint crossed the nominal public factory boundary. */
export const isSchemaConstraintDefinition = (
	value: object,
): value is SchemaConstraintDefinition => schemaConstraints.has(value)
