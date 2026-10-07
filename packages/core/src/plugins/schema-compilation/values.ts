import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

import type { GenericField } from '../../schema/fields/base/contract.js'
import {
	assertFieldDefinition,
	replaceDeclaredFieldOptions,
} from '../../schema/fields/base/definition.js'
import { snapshotJsonValue } from '../../schema/fields/builtins/json.js'
import type { JsonValue } from '../../schema/fields/builtins/json.js'
import { areSchemaDeclarationValuesCompatible } from '../../schema/schema/definition.js'
import type { SchemaConstraintDefinition } from '../../schema/schema/constraints.js'
import { isSchemaConstraintDefinition } from '../../schema/schema/constraints.js'

/** Returns no projection for opaque values; selectors never inspect their contents. */
const portableOptionValue = (
	value: unknown,
	path: string,
): JsonValue | undefined => {
	try {
		return snapshotJsonValue(value, path)
	} catch (error: unknown) {
		if (!(error instanceof TypeError || error instanceof RangeError))
			throw error
		return undefined
	}
}

/** Validates inert ledgers and selections without invoking application callbacks. */
export const assertFrozenPortable = (
	value: unknown,
	path: string,
	seen: WeakSet<object> = new WeakSet<object>(),
): void => {
	if (
		value === null ||
		typeof value === 'string' ||
		typeof value === 'boolean' ||
		(typeof value === 'number' && Number.isFinite(value))
	)
		return
	if (
		typeof value !== 'object' ||
		(!Array.isArray(value) && !isPlainRecord(value))
	)
		throw new TypeError(`${path} must contain only portable values`)
	if (!Object.isFrozen(value)) throw new TypeError(`${path} must be immutable`)
	if (seen.has(value))
		throw new TypeError(`${path} must not contain circular references`)
	seen.add(value)
	for (const key of Reflect.ownKeys(value)) {
		if (typeof key !== 'string')
			throw new TypeError(`${path} must not contain symbol keys`)
		const child: unknown = Reflect.get(value, key)
		assertFrozenPortable(child, `${path}.${key}`, seen)
	}
	seen.delete(value)
}

/** Compilation-local membership proofs use actual values, with no artifact IDs or lookup table. */
export class SchemaCompilationValues {
	readonly #fields = new WeakSet<object>()
	readonly #constraints = new WeakSet<object>()
	readonly #opaque = new Set<unknown>()

	snapshot(value: unknown, path: string): unknown {
		const portable = portableOptionValue(value, path)
		if (portable !== undefined) return portable
		this.#opaque.add(value)
		return value
	}

	/** Reuses preparation's classification without reading opaque getters again. */
	selectionValue(value: unknown): unknown {
		return this.#opaque.has(value) ? undefined : value
	}

	field(field: GenericField, path: string): GenericField {
		assertFieldDefinition(field, path)
		const options: Record<string, unknown> = Object.fromEntries(
			Object.entries(field.options).map(([name, value]) => [
				name,
				this.snapshot(value, `${path}.options.${name}`),
			]),
		)
		if ('fields' in field.options && isPlainRecord(field.options.fields)) {
			const nested = Object.entries(field.options.fields)
			if (field.kind !== 'object' && nested.length > 0)
				throw new TypeError(
					`Only object fields may contain nested fields: ${path}`,
				)
			if (field.kind === 'object') {
				options.fields = immutableRecord(
					Object.fromEntries(
						nested.map(([name, child]) => {
							assertFieldDefinition(child, `${path}.fields.${name}`)
							return [name, this.field(child, `${path}.fields.${name}`)]
						}),
					),
				)
			}
		}
		const snapshot = immutableRecord(options)
		const result = areSchemaDeclarationValuesCompatible(field.options, snapshot)
			? field
			: replaceDeclaredFieldOptions(field, snapshot)
		this.#fields.add(result)
		return result
	}

	/** Only an authorized additive setter may derive a new field from an admitted one. */
	withFieldOption(
		field: GenericField,
		name: string,
		value: unknown,
	): GenericField {
		this.assertField(field, 'schema field option target')
		const result = replaceDeclaredFieldOptions(
			field,
			immutableRecord({ ...field.options, [name]: value }),
		)
		this.#fields.add(result)
		return result
	}

	assertField(value: unknown, path: string): asserts value is GenericField {
		assertFieldDefinition(value, path)
		if (!this.#fields.has(value))
			throw new TypeError(
				`${path} contains a field absent from compilation input`,
			)
	}

	constraint(value: SchemaConstraintDefinition): SchemaConstraintDefinition {
		if (!isSchemaConstraintDefinition(value))
			throw new TypeError('Schema compiler constraint is invalid')
		this.#constraints.add(value)
		return value
	}

	assertConstraint(value: unknown, path: string): void {
		if (
			!isPlainRecord(value) ||
			!isSchemaConstraintDefinition(value) ||
			!this.#constraints.has(value)
		)
			throw new TypeError(
				`${path} contains a constraint absent from compilation input`,
			)
	}

	assertOption(value: unknown, path: string): void {
		if (!this.#opaque.has(value)) assertFrozenPortable(value, path)
	}
}
