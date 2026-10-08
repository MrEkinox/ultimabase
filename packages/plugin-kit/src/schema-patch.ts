import {
	addSchemaField,
	addSchemaIndex,
	setSchemaFieldOption,
	setSchemaOption,
	type AddSchemaFieldOperation,
	type AddSchemaFieldOptions,
	type AddSchemaIndexOperation,
	type ForbiddenMutationInputField,
	type GenericField,
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
export type AddPatchFieldOptions = AddSchemaFieldOptions

/** Describes one additive index in an immutable schema patch. */
export interface AddPatchIndexOptions {
	readonly contributionId: string
	readonly fields: readonly [string, string, ...string[]]
	readonly unique?: boolean
}

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
export class SchemaPatchBuilder<
	TOperations extends readonly SchemaPatchOperation[] = readonly [],
> {
	readonly operations: TOperations

	private constructor(operations: TOperations) {
		this.operations = immutableArray(operations) as TOperations
		Object.freeze(this)
	}

	/** Creates one empty immutable patch. */
	static create(): SchemaPatchBuilder {
		return new SchemaPatchBuilder([])
	}

	/** Adds one logical field through Core's validated patch factory. */
	addField<
		const TName extends string,
		const TField extends GenericField,
		const TMutationInput extends 'forbidden' | undefined = undefined,
	>(
		options: AddSchemaFieldOptions<TName, TField> &
			Readonly<{ mutationInput?: TMutationInput }>,
	): SchemaPatchBuilder<
		readonly [
			...TOperations,
			AddSchemaFieldOperation<
				TName,
				TMutationInput extends 'forbidden'
					? ForbiddenMutationInputField<TField>
					: TField
			>,
		]
	> {
		return this.append(addSchemaField(options))
	}

	/** Adds one composite index through Core's validated patch factory. */
	addIndex(
		options: AddPatchIndexOptions,
	): SchemaPatchBuilder<readonly [...TOperations, AddSchemaIndexOperation]> {
		return this.append(addSchemaIndex(options))
	}

	/** Sets one plugin-owned schema option through Core's validated patch factory. */
	setSchemaOption(
		options: SetPatchSchemaOptionOptions,
	): SchemaPatchBuilder<readonly [...TOperations, SetSchemaOptionOperation]> {
		return this.append(setSchemaOption(options))
	}

	/** Sets one plugin-owned field option through Core's validated patch factory. */
	setFieldOption(
		options: SetPatchFieldOptionOptions,
	): SchemaPatchBuilder<
		readonly [...TOperations, SetSchemaFieldOptionOperation]
	> {
		return this.append(setSchemaFieldOption(options))
	}

	private append<const TOperation extends SchemaPatchOperation>(
		operation: TOperation,
	): SchemaPatchBuilder<readonly [...TOperations, TOperation]> {
		return new SchemaPatchBuilder([...this.operations, operation])
	}
}

/**
 * Starts one empty immutable additive schema patch.
 * @example `const patch = schemaPatch().addIndex({ contributionId: 'search', fields: ['title', 'createdAt'] })`
 */
export const schemaPatch = (): SchemaPatchBuilder => SchemaPatchBuilder.create()

/** Binds one immutable patch to a selection for `schemas.patch(...)`. */
export interface PatchSchemasOptions<
	TOperations extends readonly SchemaPatchOperation[] =
		readonly SchemaPatchOperation[],
	TSelection extends SchemaSelection = SchemaSelection,
> {
	readonly patch: SchemaPatchBuilder<TOperations>
	readonly staticOptions?: Readonly<Record<string, JsonValue>>
	readonly targets: TSelection
}

/** Contains the exact inert declaration accepted by Core's owner-bound registrar. */
export interface SchemaPatchDeclaration<
	TOperations extends readonly SchemaPatchOperation[] =
		readonly SchemaPatchOperation[],
	TSelection extends SchemaSelection = SchemaSelection,
> {
	readonly operations: TOperations
	readonly staticOptions?: Readonly<Record<string, JsonValue>>
	readonly targets: TSelection
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
export const patchSchemas = <
	const TOperations extends readonly SchemaPatchOperation[],
	const TSelection extends SchemaSelection,
>(
	options: PatchSchemasOptions<TOperations, TSelection>,
): SchemaPatchDeclaration<TOperations, TSelection> => {
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
