import type { SchemaUpdateData, SchemaDefinition } from '../../schema/index.js'
import type { SchemaNumericFieldName } from '../../schema/type-info.js'
import type { DecrementUpdateValue, IncrementUpdateValue } from './operators.js'

/** Leaves concrete update expressions structurally extensible for Operation AST. */
export interface UpdateExpressionNode {
	readonly kind: string
}

/** Selects every schema field that developer update inference keeps mutable. */
export type UpdateFieldName<TSchema extends SchemaDefinition> =
	keyof SchemaUpdateData<TSchema> & string

type UpdateFieldValue<
	TSchema extends SchemaDefinition,
	TFieldName extends string,
> = TFieldName extends keyof SchemaUpdateData<TSchema>
	? Exclude<SchemaUpdateData<TSchema>[TFieldName], undefined>
	: never

/** Lists built-in scalar kinds with portable addition and subtraction semantics. */
export const numericUpdateFieldKinds = [
	'bigint',
	'decimal',
	'float',
	'int',
] as const

export type NumericUpdateFieldName<TSchema extends SchemaDefinition> = Extract<
	SchemaNumericFieldName<TSchema>,
	UpdateFieldName<TSchema>
>

/** Correlates every mutable field with its exact schema-derived replacement value. */
export type UpdateSetInput<TSchema extends SchemaDefinition> = Readonly<
	SchemaUpdateData<TSchema>
>

/** Correlates numeric fields with non-null deltas of their exact scalar type. */
export type NumericUpdateInput<TSchema extends SchemaDefinition> = {
	readonly [TFieldName in NumericUpdateFieldName<TSchema>]?: Exclude<
		UpdateFieldValue<TSchema, TFieldName>,
		null
	>
}

/** Materializes mapped values so public hovers expose their concrete fields. */
type SimplifyUpdateInput<TInput> = TInput extends object
	? { [TKey in keyof TInput]: TInput[TKey] } & {}
	: TInput

type CompactUpdateDataFields<TSet extends object, TNumeric extends object> = {
	readonly [TFieldName in keyof TSet]?:
		| Exclude<TSet[TFieldName], undefined>
		| (TFieldName extends keyof TNumeric
				? | IncrementUpdateValue<Exclude<TNumeric[TFieldName], undefined>>
					| DecrementUpdateValue<Exclude<TNumeric[TFieldName], undefined>>
				: never)
}

type RequireOneField<TFields extends object> = {
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
export type UpdateExpressionInput<TSchema extends SchemaDefinition> =
	string extends TSchema['className']
		? Readonly<Record<string, unknown>>
		: CompactUpdateExpressionInput<
				SimplifyUpdateInput<UpdateSetInput<TSchema>>,
				SimplifyUpdateInput<NumericUpdateInput<TSchema>>
			>

interface UpdateFieldOperationNode<
	TKind extends string,
	TFieldName extends string,
> extends UpdateExpressionNode {
	readonly kind: TKind
	readonly field: TFieldName
}

/** Replaces one mutable field with an exact schema-derived update value. */
export type SetUpdateOperationNode<
	TSchema extends SchemaDefinition,
	TFieldName extends UpdateFieldName<TSchema> = UpdateFieldName<TSchema>,
> =
	TFieldName extends UpdateFieldName<TSchema>
		? UpdateFieldOperationNode<'set', TFieldName> & {
				readonly value: UpdateFieldValue<TSchema, TFieldName>
			}
		: never

type NumericUpdateOperationNode<
	TSchema extends SchemaDefinition,
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
	TSchema extends SchemaDefinition,
	TFieldName extends NumericUpdateFieldName<TSchema> =
		NumericUpdateFieldName<TSchema>,
> = NumericUpdateOperationNode<TSchema, 'increment', TFieldName>

/** Subtracts one exact numeric delta without reading the current value first. */
export type DecrementUpdateOperationNode<
	TSchema extends SchemaDefinition,
	TFieldName extends NumericUpdateFieldName<TSchema> =
		NumericUpdateFieldName<TSchema>,
> = NumericUpdateOperationNode<TSchema, 'decrement', TFieldName>

/** Enumerates every atomic field operation accepted by one update expression. */
export type UpdateOperationNode<TSchema extends SchemaDefinition> =
	| SetUpdateOperationNode<TSchema>
	| IncrementUpdateOperationNode<TSchema>
	| DecrementUpdateOperationNode<TSchema>

/** Stores normalized operations in deterministic own-property enumeration order. */
export interface UpdateExpression<
	TSchema extends SchemaDefinition,
> extends UpdateExpressionNode {
	readonly kind: 'update-expression'
	readonly operations: readonly UpdateOperationNode<TSchema>[]
}
