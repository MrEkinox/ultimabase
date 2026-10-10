import type { SchemaTypeInfoFor, SchemaTypeInfoSource } from '../type-info.js'

/** Requires at least one item while preserving readonly tuple inference. */
export type NestedWriteNonEmptyArray<TValue> = readonly [TValue, ...TValue[]]

type WithoutKeys<TKey extends PropertyKey> = Readonly<
	Partial<Record<TKey, never>>
>

/**
 * Links one pointer to an existing row (ADR-0308): its object id or a Pointer
 * of the declared target already in hand.
 *
 * @example `{ connect: todo.assignee }`
 */
export type PointerLinkInput<TLink = string> = Readonly<{
	readonly connect: TLink
}>

/** Connects or creates one pointer target during a root create. */
export type NestedPointerCreateInput<TCreate extends object, TLink = string> =
	| (PointerLinkInput<TLink> & WithoutKeys<'create'>)
	| (Readonly<{ readonly create: TCreate }> & WithoutKeys<'connect'>)

type NestedPointerUpdateCommand = 'connect' | 'create' | 'update'

type WithoutPointerUpdateCommands<TCommand extends NestedPointerUpdateCommand> =
	WithoutKeys<Exclude<NestedPointerUpdateCommand, TCommand>>

/**
 * Applies one command to a pointer during a root update; `null` unlinks an
 * optional pointer (ADR-0308).
 */
export type NestedPointerUpdateInput<
	TCreate extends object,
	TUpdate extends object,
	TNullable extends boolean = true,
	TLink = string,
> =
	| (PointerLinkInput<TLink> & WithoutPointerUpdateCommands<'connect'>)
	| (Readonly<{ readonly create: TCreate }> &
			WithoutPointerUpdateCommands<'create'>)
	| (Readonly<{ readonly update: TUpdate }> &
			WithoutPointerUpdateCommands<'update'>)
	| (TNullable extends true ? null : never)

/** Targets one currently related object with an exact nested update. */
export interface NestedRelationUpdateItemInput<TUpdate extends object> {
	readonly data: TUpdate
	readonly id: string
}

type NestedRelationIncrementalFields<
	TCreate extends object,
	TUpdate extends object,
	TCanDisconnect extends boolean,
	TLink,
> = Readonly<{
	readonly connect?: NestedWriteNonEmptyArray<TLink>
	readonly create?: NestedWriteNonEmptyArray<TCreate>
	readonly update?: NestedWriteNonEmptyArray<
		NestedRelationUpdateItemInput<TUpdate>
	>
}> &
	(TCanDisconnect extends true
		? Readonly<{ readonly disconnect?: NestedWriteNonEmptyArray<TLink> }>
		: object)

type RequireOneIncrementalField<TFields extends object> = Readonly<TFields> &
	{
		[TKey in keyof TFields]-?: Readonly<Required<Pick<TFields, TKey>>>
	}[keyof TFields]

/** Creates or connects at least one target during a root create. */
export type NestedRelationCreateInput<
	TCreate extends object,
	TLink = string,
> = RequireOneIncrementalField<
	Readonly<{
		readonly connect?: NestedWriteNonEmptyArray<TLink>
		readonly create?: NestedWriteNonEmptyArray<TCreate>
	}>
>

/**
 * Composes incremental work or selects the exclusive replacement `set`;
 * `{ set: [] }` removes every visible member (ADR-0308).
 */
export type NestedRelationUpdateInput<
	TCreate extends object,
	TUpdate extends object,
	TCanDisconnect extends boolean = true,
	TLink = string,
> =
	| (RequireOneIncrementalField<
			NestedRelationIncrementalFields<TCreate, TUpdate, TCanDisconnect, TLink>
	  > &
			WithoutKeys<TCanDisconnect extends true ? 'set' : never>)
	| (TCanDisconnect extends true
			? Readonly<{ readonly set: readonly TLink[] }> &
					WithoutKeys<'connect' | 'create' | 'disconnect' | 'update'>
			: never)

/** Reads the exact nested create data generated for one schema. */
export type SchemaNestedCreateData<TSchema extends SchemaTypeInfoSource> =
	SchemaTypeInfoFor<TSchema>['inputs']['nestedCreate']

/** Reads the exact nested update replacement data generated for one schema. */
export type SchemaNestedUpdateData<TSchema extends SchemaTypeInfoSource> =
	SchemaTypeInfoFor<TSchema>['inputs']['nestedUpdate']
