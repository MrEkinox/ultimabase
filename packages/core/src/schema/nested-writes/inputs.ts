import type { SchemaTypeInfoFor, SchemaTypeInfoSource } from '../type-info.js'

/** Requires at least one item while preserving readonly tuple inference. */
export type NestedWriteNonEmptyArray<TValue> = readonly [TValue, ...TValue[]]

type WithoutKeys<TKey extends PropertyKey> = Readonly<
	Partial<Record<TKey, never>>
>

/** Connects or creates one pointer target during a root create. */
export type NestedPointerCreateInput<TCreate extends object> =
	| (Readonly<{ readonly connect: string }> & WithoutKeys<'create'>)
	| (Readonly<{ readonly create: TCreate }> & WithoutKeys<'connect'>)

/** Applies one legal command to a pointer during a root update. */
type NestedPointerUpdateCommand<TCanDisconnect extends boolean> =
	TCanDisconnect extends true
		? 'connect' | 'create' | 'disconnect' | 'update'
		: 'connect' | 'create' | 'update'

type WithoutPointerUpdateCommands<
	TCommand extends NestedPointerUpdateCommand<TCanDisconnect>,
	TCanDisconnect extends boolean,
> = WithoutKeys<Exclude<NestedPointerUpdateCommand<TCanDisconnect>, TCommand>>

export type NestedPointerUpdateInput<
	TCreate extends object,
	TUpdate extends object,
	TCanDisconnect extends boolean = true,
> =
	| (Readonly<{ readonly connect: string }> &
			WithoutPointerUpdateCommands<'connect', TCanDisconnect>)
	| (Readonly<{ readonly create: TCreate }> &
			WithoutPointerUpdateCommands<'create', TCanDisconnect>)
	| (Readonly<{ readonly update: TUpdate }> &
			WithoutPointerUpdateCommands<'update', TCanDisconnect>)
	| (TCanDisconnect extends true
			? Readonly<{ readonly disconnect: true }> &
					WithoutPointerUpdateCommands<'disconnect', TCanDisconnect>
			: never)

/** Targets one currently related object with an exact nested update. */
export interface NestedRelationUpdateItemInput<TUpdate extends object> {
	readonly data: TUpdate
	readonly id: string
}

type NestedRelationIncrementalFields<
	TCreate extends object,
	TUpdate extends object,
	TCanDisconnect extends boolean,
> = Readonly<{
	readonly connect?: NestedWriteNonEmptyArray<string>
	readonly create?: NestedWriteNonEmptyArray<TCreate>
	readonly update?: NestedWriteNonEmptyArray<
		NestedRelationUpdateItemInput<TUpdate>
	>
}> &
	(TCanDisconnect extends true
		? Readonly<{ readonly disconnect?: NestedWriteNonEmptyArray<string> }>
		: object)

type RequireOneIncrementalField<TFields extends object> = Readonly<TFields> &
	{
		[TKey in keyof TFields]-?: Readonly<Required<Pick<TFields, TKey>>>
	}[keyof TFields]

/** Creates or connects at least one target during a root create. */
export type NestedRelationCreateInput<TCreate extends object> =
	RequireOneIncrementalField<
		Readonly<{
			readonly connect?: NestedWriteNonEmptyArray<string>
			readonly create?: NestedWriteNonEmptyArray<TCreate>
		}>
	>

/** Composes incremental work or selects one exclusive replacement command. */
export type NestedRelationUpdateInput<
	TCreate extends object,
	TUpdate extends object,
	TCanDisconnect extends boolean = true,
> =
	| (RequireOneIncrementalField<
			NestedRelationIncrementalFields<TCreate, TUpdate, TCanDisconnect>
	  > &
			WithoutKeys<TCanDisconnect extends true ? 'clear' | 'set' : never>)
	| (TCanDisconnect extends true
			? | (Readonly<{ readonly set: readonly string[] }> &
						WithoutKeys<
							'clear' | 'connect' | 'create' | 'disconnect' | 'update'
						>)
				| (Readonly<{ readonly clear: true }> &
						WithoutKeys<'connect' | 'create' | 'disconnect' | 'set' | 'update'>)
			: never)

/** Reads the exact nested create data generated for one schema. */
export type SchemaNestedCreateData<TSchema extends SchemaTypeInfoSource> =
	SchemaTypeInfoFor<TSchema>['inputs']['nestedCreate']

/** Reads the exact nested update replacement data generated for one schema. */
export type SchemaNestedUpdateData<TSchema extends SchemaTypeInfoSource> =
	SchemaTypeInfoFor<TSchema>['inputs']['nestedUpdate']
