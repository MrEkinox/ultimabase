import {
	addSchemaConstraint,
	addSchemaExtension,
	addSchemaField,
	addSchemaIndex,
	setSchemaFieldOption,
	setSchemaOption,
	type AddSchemaConstraintOperation,
	type AddSchemaExtensionOperation,
	type AddSchemaFieldOperation,
	type JsonValue,
	type SchemaPatchOperation,
	type SchemaSelection,
	type SetSchemaFieldOptionOperation,
	type SetSchemaOptionOperation,
} from '@ultimabase/core'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

/** Describes one additive field in an immutable schema patch. */
export type AddPatchFieldOptions = Omit<AddSchemaFieldOperation, 'kind'>

/** Describes one additive index in an immutable schema patch. */
export interface AddPatchIndexOptions {
	readonly contributionId: string
	readonly fields: readonly [string, string, ...string[]]
	readonly unique?: boolean
}

/** Describes one additive extension in an immutable schema patch. */
export type AddPatchExtensionOptions = Omit<AddSchemaExtensionOperation, 'kind'>

/** Describes one additive portable constraint in an immutable schema patch. */
export type AddPatchConstraintOptions = Omit<
	AddSchemaConstraintOperation,
	'kind'
>

/** Describes one schema option value contributed by the current plugin. */
export type SetPatchSchemaOptionOptions = Omit<SetSchemaOptionOperation, 'kind'>

/** Describes one field option value contributed by the current plugin. */
export type SetPatchFieldOptionOptions = Omit<
	SetSchemaFieldOptionOperation,
	'kind'
>

/**
 * Builds common additive schema patches without hiding Core's operation factories.
 * Every method returns a new builder; cross-owner replacement and removal stay explicit.
 *
 * @example `schemaPatch().addField({ contributionId: 'state', name: 'state', field })`
 */
export class SchemaPatchBuilder {
	readonly operations: readonly SchemaPatchOperation[]

	private constructor(operations: readonly SchemaPatchOperation[]) {
		this.operations = immutableArray(operations)
		Object.freeze(this)
	}

	/** Creates one empty immutable patch. */
	static create(): SchemaPatchBuilder {
		return new SchemaPatchBuilder([])
	}

	/** Adds one logical field through Core's validated patch factory. */
	addField(options: AddPatchFieldOptions): SchemaPatchBuilder {
		return this.append(addSchemaField(options))
	}

	/** Adds one composite index through Core's validated patch factory. */
	addIndex(options: AddPatchIndexOptions): SchemaPatchBuilder {
		return this.append(addSchemaIndex(options))
	}

	/** Adds one schema extension through Core's validated patch factory. */
	addExtension(options: AddPatchExtensionOptions): SchemaPatchBuilder {
		return this.append(addSchemaExtension(options))
	}

	/** Adds one portable constraint through Core's validated patch factory. */
	addConstraint(options: AddPatchConstraintOptions): SchemaPatchBuilder {
		return this.append(addSchemaConstraint(options))
	}

	/** Sets one plugin-owned schema option through Core's validated patch factory. */
	setSchemaOption(options: SetPatchSchemaOptionOptions): SchemaPatchBuilder {
		return this.append(setSchemaOption(options))
	}

	/** Sets one plugin-owned field option through Core's validated patch factory. */
	setFieldOption(options: SetPatchFieldOptionOptions): SchemaPatchBuilder {
		return this.append(setSchemaFieldOption(options))
	}

	private append(operation: SchemaPatchOperation): SchemaPatchBuilder {
		return new SchemaPatchBuilder([...this.operations, operation])
	}
}

/**
 * Starts one empty immutable additive schema patch.
 * @example `const patch = schemaPatch().addIndex({ contributionId: 'search', fields: ['title', 'createdAt'] })`
 */
export const schemaPatch = (): SchemaPatchBuilder => SchemaPatchBuilder.create()

/** Binds one immutable patch to a selection for `schemas.patch(...)`. */
export interface PatchSchemasOptions {
	readonly patch: SchemaPatchBuilder
	readonly staticOptions?: Readonly<Record<string, JsonValue>>
	readonly targets: SchemaSelection
}

/** Contains the exact inert declaration accepted by Core's owner-bound registrar. */
export interface SchemaPatchDeclaration {
	readonly operations: readonly SchemaPatchOperation[]
	readonly staticOptions?: Readonly<Record<string, JsonValue>>
	readonly targets: SchemaSelection
}

/**
 * Produces registrar input while preserving Core-created operation identities.
 *
 * @example
 * ```ts
 * schemas.patch(patchSchemas({
 *   targets: schemas.select({ className: 'Post' }),
 *   patch: schemaPatch().addField({ contributionId: 'state', name: 'state', field }),
 * }))
 * ```
 */
export const patchSchemas = (
	options: PatchSchemasOptions,
): SchemaPatchDeclaration => {
	if (!isPlainRecord(options)) {
		throw new TypeError('schema patch binding must be a plain object')
	}
	for (const key of Reflect.ownKeys(options)) {
		if (key !== 'patch' && key !== 'staticOptions' && key !== 'targets') {
			throw new TypeError(`Unknown schema patch binding option: ${String(key)}`)
		}
	}
	if (!(options.patch instanceof SchemaPatchBuilder)) {
		throw new TypeError('schema patch must be created by schemaPatch')
	}

	return immutableRecord({
		operations: options.patch.operations,
		...(options.staticOptions === undefined
			? {}
			: { staticOptions: immutableRecord(options.staticOptions) }),
		targets: options.targets,
	})
}
