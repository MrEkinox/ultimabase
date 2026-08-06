import { assertNonEmptyString, immutableRecord } from '@ultimabase/shared'

import type { QueryTerminalOptions } from '../../query/operations/execution.js'
import type { OperationObjectId } from '../../query/operations/contracts.js'
import type { InferQueryResult } from '../../query/query/result.js'
import {
	executeQueryExists,
	executeQueryFindOne,
	scopeQueryToObjectId,
} from '../../query/query/query.js'
import {
	queryFromExistsInput,
	queryFromFindOneInput,
	type ExactReadInput,
	type ExistsInput,
	type FindOneInput,
	type QueryIncludedPointerFromInput,
	type QuerySelectedFieldFromInput,
} from '../../query/query/input.js'
import { Schema, type SchemaDefinition } from '../schema/definition.js'

/** Describes the stable transport-neutral JSON identity of one pointer. */
export interface PointerJSON<TClassName extends string = string> {
	/** Identifies the logical value without adopting a transport-specific marker. */
	readonly type: 'pointer'
	/** Names the target schema independently from physical table names. */
	readonly className: TClassName
	/** Carries the framework-owned identifier of the target object. */
	readonly id: string
}

class PointerValueBrand {
	// The hidden base prevents structural objects from satisfying PointerValue.
	declare private readonly pointerValueIdentity: undefined
}

/**
 * Erases only a Pointer's schema generic while retaining its nominal identity.
 *
 * Consumer APIs use this compact boundary when they need identity but do not
 * inspect schema-specific fields or build a typed query.
 */
export interface PointerValue extends PointerValueBrand {
	/** Returns the immutable framework-owned target identifier. */
	readonly id: string
	/** Serializes the schema-qualified identity without loading its object. */
	toJSON(): Readonly<PointerJSON>
}

const pointerInstances = new WeakSet<object>()

/**
 * Represents one immutable reference to an object without loading that object.
 *
 * @example
 * ```ts
 * const author = new Pointer(User, "0198f090-2a50-7000-8000-000000000034")
 * ```
 */
export class Pointer<
	TSchema extends SchemaDefinition = SchemaDefinition,
> extends PointerValueBrand {
	readonly #schema: TSchema
	readonly #id: string

	constructor(schema: TSchema, id: string) {
		super()

		if (new.target !== Pointer) {
			throw new TypeError('Pointer cannot be subclassed')
		}

		if (!Schema.is(schema)) {
			throw new TypeError('Pointer schema must be created by Schema.define')
		}

		assertNonEmptyString(id, 'Pointer id')

		this.#schema = schema
		this.#id = id
		pointerInstances.add(this)

		// Private state plus a frozen shell prevents forged or mutable identities.
		Object.freeze(this)
	}

	/** Narrows an untrusted value to a Pointer created by this Core instance. */
	static is(value: unknown): value is Pointer {
		return (
			typeof value === 'object' && value !== null && pointerInstances.has(value)
		)
	}

	/** Returns the exact logical target schema without performing database I/O. */
	get schema(): TSchema {
		return this.#schema
	}

	/** Returns the immutable framework-owned target identifier. */
	get id(): string {
		return this.#id
	}

	/** Compares exact schema identity and target identifier. */
	equals(other: unknown): other is Pointer<TSchema> {
		return (
			Pointer.is(other) &&
			other.schema === this.#schema &&
			other.id === this.#id
		)
	}

	/** Reads this exact target through the ordinary read pipeline. */
	findOne<const TInput extends FindOneInput<TSchema>>(
		input: ExactReadInput<TSchema, TInput, FindOneInput<TSchema>>,
		options?: QueryTerminalOptions,
	): Promise<InferQueryResult<
		TSchema,
		QuerySelectedFieldFromInput<TSchema, TInput>,
		QueryIncludedPointerFromInput<TSchema, TInput>
	> | null>
	/** Reads this exact target without applying a projection. */
	findOne(
		input?: undefined,
		options?: QueryTerminalOptions,
	): Promise<InferQueryResult<TSchema> | null>
	findOne(
		input: FindOneInput<TSchema> = {},
		options?: QueryTerminalOptions,
	): Promise<object | null> {
		const query = scopeQueryToObjectId(
			queryFromFindOneInput(this.#schema, input),
			this.#id as OperationObjectId<TSchema>,
		)

		return executeQueryFindOne(query, options)
	}

	/** Tests whether this exact target exists and remains visible. */
	exists(
		input: ExistsInput<TSchema> = {},
		options?: QueryTerminalOptions,
	): Promise<boolean> {
		const query = scopeQueryToObjectId(
			queryFromExistsInput(this.#schema, input),
			this.#id as OperationObjectId<TSchema>,
		)

		return executeQueryExists(query, options)
	}

	/** Serializes the logical identity without exposing database representation. */
	toJSON(): Readonly<PointerJSON<TSchema['className']>> {
		return immutableRecord({
			type: 'pointer',
			className: this.#schema.className,
			id: this.#id,
		})
	}
}

/** Validates one pointer boundary while structurally sharing its immutable value. */
export const snapshotPointerValue = (value: unknown, path: string): Pointer => {
	if (!Pointer.is(value)) {
		throw new TypeError(`${path} must be a Pointer`)
	}

	return value
}
