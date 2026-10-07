import { Pointer } from '../relations/pointer.js'
import type { SchemaDefinition } from './definition.js'
import type { SchemaModelCapabilityContext } from './model-contracts.js'
import { readPersistedSchemaModelRecord } from './model-state.js'

const toPersistedSchemaPointer = <TTarget extends SchemaDefinition>(
	target: TTarget,
	value: unknown,
	command: string,
): Pointer<TTarget> => {
	if (Pointer.is(value)) {
		if (value.schema !== target) {
			throw new TypeError(
				`${command} target must belong to ${target.className}`,
			)
		}

		return new Pointer(target, value.id)
	}

	if (typeof value !== 'object' || value === null) {
		throw new TypeError(
			`${command} target must be a Pointer or persisted schema model`,
		)
	}

	const record = readPersistedSchemaModelRecord(value, command)

	if (record.schema !== target) {
		throw new TypeError(`${command} target must belong to ${target.className}`)
	}
	if (typeof record.objectId !== 'string') {
		throw new TypeError(`${command} target has an invalid persisted identity`)
	}

	return new Pointer(target, record.objectId)
}

/** Creates an immutable specialization context without exposing private model state. */
export const createSchemaModelCapabilityContext = <
	const TSchema extends SchemaDefinition,
>(
	schema: TSchema,
): SchemaModelCapabilityContext<TSchema> =>
	Object.freeze({
		schema,
		assertPersisted: (instance: object, command: string): void => {
			const record = readPersistedSchemaModelRecord(instance, command)

			if (record.schema !== schema) {
				throw new TypeError(
					`${command} receiver must belong to ${schema.className}`,
				)
			}
		},
		toPointer: toPersistedSchemaPointer,
	})

/**
 * Attaches validated package-owned result methods, then closes the generated
 * model prototype so no later specialization can change persisted results.
 */
export const finalizeSchemaModelClass = (
	schema: SchemaDefinition,
	resultCapabilities: Readonly<Record<string, unknown>> = {},
): void => {
	const prototype: unknown = Reflect.get(schema, 'prototype')

	if (typeof prototype !== 'object' || prototype === null) {
		throw new TypeError('schema model prototype is unavailable')
	}

	for (const [name, capability] of Object.entries(resultCapabilities)) {
		if (name.length === 0 || typeof capability !== 'function') {
			throw new TypeError(
				'schema result capabilities must contain named functions',
			)
		}

		if (name in prototype) {
			throw new TypeError(`Reserved schema result capability: ${name}`)
		}

		Object.defineProperty(prototype, name, {
			configurable: false,
			enumerable: false,
			value: capability,
			writable: false,
		})
	}

	Object.freeze(prototype)
}
