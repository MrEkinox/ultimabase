import type {
	SchemaNestedUpdateData,
	SchemaStoredUpdateData,
	SchemaUpdateData,
} from '../../schema/index.js'
import type {
	SchemaNumericFieldName,
	SchemaTypeInfoFor,
	SchemaTypeInfoSource,
} from '../../schema/type-info.js'

/** Leaves concrete update expressions structurally extensible for Operation AST. */
export interface UpdateExpressionNode {
	readonly kind: string
}

/** Selects every schema field that developer update inference keeps mutable. */
export type UpdateFieldName<TSchema extends SchemaTypeInfoSource> =
	keyof SchemaUpdateData<TSchema> & string

type UpdateFieldValue<
	TSchema extends SchemaTypeInfoSource,
	TFieldName extends string,
> = TFieldName extends keyof SchemaUpdateData<TSchema>
	? Exclude<SchemaUpdateData<TSchema>[TFieldName], undefined>
	: never

/** One field value as a normalized update operation stores it (ADR-0308). */
type StoredUpdateFieldValue<
	TSchema extends SchemaTypeInfoSource,
	TFieldName extends string,
> = TFieldName extends keyof SchemaStoredUpdateData<TSchema>
	? Exclude<SchemaStoredUpdateData<TSchema>[TFieldName], undefined>
	: never

/** Lists built-in scalar kinds with portable addition and subtraction semantics. */
export const numericUpdateFieldKinds = [
	'bigint',
	'decimal',
	'float',
	'int',
] as const

export type NumericUpdateFieldName<TSchema extends SchemaTypeInfoSource> =
	Extract<SchemaNumericFieldName<TSchema>, UpdateFieldName<TSchema>>

/** Correlates every mutable field with its exact schema-derived replacement value. */
export type UpdateSetInput<TSchema extends SchemaTypeInfoSource> = Readonly<
	SchemaUpdateData<TSchema>
>

/** Correlates numeric fields with non-null deltas of their exact scalar type. */
export type NumericUpdateInput<TSchema extends SchemaTypeInfoSource> = {
	readonly [TFieldName in NumericUpdateFieldName<TSchema>]?: Exclude<
		UpdateFieldValue<TSchema, TFieldName>,
		null
	>
}

/** Materializes mapped values so public hovers expose their concrete fields. */
type SimplifyUpdateInput<TInput> = TInput extends object
	? { [TKey in keyof TInput]: TInput[TKey] } & {}
	: TInput

/**
 * One atomic operation on a non-list numeric field, with an operand of the
 * field's value type (ADR-0307).
 *
 * @example `{ views: { increment: 1 } }`
 */
export type NumericUpdateOperation<TValue> =
	| Readonly<{
			/** Adds this operand atomically. */
			increment: TValue
			decrement?: never
	  }>
	| Readonly<{
			/** Subtracts this operand atomically. */
			decrement: TValue
			increment?: never
	  }>

type CompactUpdateDataFields<TSet extends object, TNumeric extends object> = {
	readonly [TFieldName in keyof TSet]?:
		| Exclude<TSet[TFieldName], undefined>
		| (TFieldName extends keyof TNumeric
				? NumericUpdateOperation<Exclude<TNumeric[TFieldName], undefined>>
				: never)
}

/** @internal Requires exactly one named field and keeps the others optional. */
export type RequireOneField<TFields extends object> = {
	[TKey in keyof TFields]-?: Readonly<
		Required<Pick<TFields, TKey>> & Partial<Omit<TFields, TKey>>
	>
}[keyof TFields]

/** Materializes a field-oriented update without retaining schema definitions. */
export type CompactUpdateExpressionInput<
	TSet extends object,
	TNumeric extends object,
> = Exclude<
	SimplifyUpdateInput<RequireOneField<CompactUpdateDataFields<TSet, TNumeric>>>,
	undefined
>

/**
 * Correlates each mutable field with either its replacement value or one
 * supported operation value, while requiring at least one changed field.
 */
export type UpdateExpressionInput<TSchema extends SchemaTypeInfoSource> =
	string extends SchemaTypeInfoFor<TSchema>['key']
		? Readonly<Record<string, unknown>>
		: CompactUpdateExpressionInput<
				SimplifyUpdateInput<UpdateSetInput<TSchema>>,
				SimplifyUpdateInput<NumericUpdateInput<TSchema>>
			>

/** @internal Field map of `updateOne` data: nested commands and numeric operators. */
export type NestedUpdateDataFields<TSchema extends SchemaTypeInfoSource> =
	CompactUpdateDataFields<
		SimplifyUpdateInput<SchemaNestedUpdateData<TSchema>>,
		SimplifyUpdateInput<NumericUpdateInput<TSchema>>
	>

/** Adds numeric operators to the generated singular nested-update field map. */
export type NestedUpdateExpressionInput<TSchema extends SchemaTypeInfoSource> =
	string extends SchemaTypeInfoFor<TSchema>['key']
		? Readonly<Record<string, unknown>>
		: CompactUpdateExpressionInput<
				SimplifyUpdateInput<SchemaNestedUpdateData<TSchema>>,
				SimplifyUpdateInput<NumericUpdateInput<TSchema>>
			>

interface UpdateFieldOperationNode<
	TKind extends string,
	TFieldName extends string,
> extends UpdateExpressionNode {
	readonly kind: TKind
	readonly field: TFieldName
}

/**
 * Replaces one mutable field with an exact schema-derived update value. On a
 * single object field the value is a deep patch: omitted children keep their
 * stored values (ADR-0032).
 */
export type SetUpdateOperationNode<
	TSchema extends SchemaTypeInfoSource,
	TFieldName extends UpdateFieldName<TSchema> = UpdateFieldName<TSchema>,
> =
	TFieldName extends UpdateFieldName<TSchema>
		? UpdateFieldOperationNode<'set', TFieldName> & {
				readonly value: StoredUpdateFieldValue<TSchema, TFieldName>
			}
		: never

type NumericUpdateOperationNode<
	TSchema extends SchemaTypeInfoSource,
	TKind extends 'decrement' | 'increment',
	TFieldName extends NumericUpdateFieldName<TSchema> =
		NumericUpdateFieldName<TSchema>,
> =
	TFieldName extends NumericUpdateFieldName<TSchema>
		? UpdateFieldOperationNode<TKind, TFieldName> & {
				readonly value: Exclude<UpdateFieldValue<TSchema, TFieldName>, null>
			}
		: never

/** Adds one exact numeric delta without reading the value in application code. */
export type IncrementUpdateOperationNode<
	TSchema extends SchemaTypeInfoSource,
	TFieldName extends NumericUpdateFieldName<TSchema> =
		NumericUpdateFieldName<TSchema>,
> = NumericUpdateOperationNode<TSchema, 'increment', TFieldName>

/** Subtracts one exact numeric delta without reading the current value first. */
export type DecrementUpdateOperationNode<
	TSchema extends SchemaTypeInfoSource,
	TFieldName extends NumericUpdateFieldName<TSchema> =
		NumericUpdateFieldName<TSchema>,
> = NumericUpdateOperationNode<TSchema, 'decrement', TFieldName>

/** Enumerates every atomic field operation accepted by one update expression. */
export type UpdateOperationNode<TSchema extends SchemaTypeInfoSource> =
	| SetUpdateOperationNode<TSchema>
	| IncrementUpdateOperationNode<TSchema>
	| DecrementUpdateOperationNode<TSchema>

/** Stores normalized operations in deterministic own-property enumeration order. */
export interface UpdateExpression<
	TSchema extends SchemaTypeInfoSource,
> extends UpdateExpressionNode {
	readonly kind: 'update-expression'
	readonly operations: readonly UpdateOperationNode<TSchema>[]
}
