import { assertNonEmptyString, immutableRecord } from '@ultimabase/shared'

import type { OperationOptions } from '../../query/operations/options.js'
import type { OperationObjectId } from '../../query/operations/contracts.js'
import type { QueryResult } from '../../query/query/result.js'
import {
	executeQueryExists,
	executeQueryFindOne,
} from '../../query/query/operation-execution.js'
import { scopeQueryToObjectId } from '../../query/query/private-scope.js'
import {
	queryFromExistsInput,
	queryFromFindOneInput,
	type ExactReadInput,
	type ExistsInput,
	type FindOneInput,
	type QueryIncludedFieldFromInput,
	type QuerySelectedFieldFromInput,
} from '../../query/query/input.js'
import {
	Schema,
	type SchemaReference,
	type SchemaDefinition,
} from '../schema/definition.js'
import type { SchemaRef } from '../schema/registered-schemas.js'

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

/** Retains one pointer's exact logical target without retaining a local schema type. */
export type PointerTarget<TClassName extends string> = PointerValue &
	Readonly<{
		toJSON(): Readonly<PointerJSON<TClassName>>
	}>

/**
 * Exposes one generated pointer through the exact contract of its logical target.
 *
 * The generated registry knows a target by stable class name rather than by one
 * application-local TypeScript variable. This alias preserves every ordinary
 * Pointer capability without inventing a second runtime value or schema class.
 */
export type GeneratedPointerHandle<TClassName extends string> = Pointer<
	SchemaReference<TClassName>
>

/**
 * The schema a Pointer targets: a schema type, or the registered schema of a
 * class name, so that `Pointer<"TodoUser">` reads as the identity it names
 * (ADR-0304).
 */
export type PointerSchema<TSchema extends SchemaDefinition | string> =
	TSchema extends SchemaDefinition ? TSchema : SchemaRef<Extract<TSchema, string>>

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
	TSchema extends SchemaDefinition | string = SchemaDefinition,
> extends PointerValueBrand {
	readonly #schema: PointerSchema<TSchema>
	readonly #id: string

	constructor(schema: TSchema & SchemaDefinition, id: string) {
		super()

		if (new.target !== Pointer) {
			throw new TypeError('Pointer cannot be subclassed')
		}

		if (!Schema.is(schema)) {
			throw new TypeError('Pointer schema must be created by App.Schema.define')
		}

		assertNonEmptyString(id, 'Pointer id')

		// A name-typed Pointer is only ever built from its registered schema.
		this.#schema = schema as PointerSchema<TSchema>
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
	get schema(): PointerSchema<TSchema> {
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
	findOne<const TInput extends FindOneInput<PointerSchema<TSchema>>>(
		input: ExactReadInput<
			PointerSchema<TSchema>,
			TInput,
			FindOneInput<PointerSchema<TSchema>>
		>,
		options?: OperationOptions,
	): Promise<QueryResult<
		PointerSchema<TSchema>,
		QuerySelectedFieldFromInput<PointerSchema<TSchema>, TInput>,
		QueryIncludedFieldFromInput<PointerSchema<TSchema>, TInput>
	> | null>
	/** Reads this exact target without applying a projection. */
	findOne(
		input?: undefined,
		options?: OperationOptions,
	): Promise<QueryResult<PointerSchema<TSchema>> | null>
	findOne(
		input: FindOneInput<PointerSchema<TSchema>> = {},
		options?: OperationOptions,
	): Promise<object | null> {
		const query = scopeQueryToObjectId(
			queryFromFindOneInput(this.#schema, input),
			this.#id as OperationObjectId<PointerSchema<TSchema>>,
		)

		return executeQueryFindOne(query, options)
	}

	/** Tests whether this exact target exists and remains visible. */
	exists(
		input: ExistsInput<PointerSchema<TSchema>> = {},
		options?: OperationOptions,
	): Promise<boolean> {
		const query = scopeQueryToObjectId(
			queryFromExistsInput(this.#schema, input),
			this.#id as OperationObjectId<PointerSchema<TSchema>>,
		)

		return executeQueryExists(query, options)
	}

	/** Serializes the logical identity without exposing database representation. */
	toJSON(): Readonly<PointerJSON<PointerSchema<TSchema>['className']>> {
		return immutableRecord({
			type: 'pointer',
			className: this.#schema.className,
			id: this.#id,
		})
	}
}

/**
 * @internal Reads the schema of a Pointer typed by a schema type. Generic Core
 * code cannot see through `PointerSchema` while the schema type is unresolved.
 */
export const readPointerSchema = <TSchema extends SchemaDefinition>(
	pointer: Pointer<TSchema>,
): TSchema => pointer.schema as TSchema

/** Validates one pointer boundary while structurally sharing its immutable value. */
export const snapshotPointerValue = (value: unknown, path: string): Pointer => {
	if (!Pointer.is(value)) {
		throw new TypeError(`${path} must be a Pointer`)
	}

	return value
}
