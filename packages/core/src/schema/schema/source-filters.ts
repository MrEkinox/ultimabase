import type {
	FieldContainsInput,
	FieldList,
	FieldStructuralContainsOperand,
	FieldTypeStateOf,
	FieldValue,
	GenericField,
} from '../fields/base/contract.js'
import type { JsonDocument, JsonValue } from '../fields/base/portable-json.js'
import type {
	EqualityFieldKind,
	OrderedFieldKind,
} from '../fields/base/filter-kinds.js'
import type { ObjectFields } from '../fields/builtins/object.js'
import type { PointerField } from '../fields/builtins/pointer.js'
import type { RelationField } from '../fields/builtins/relation.js'
import type { SchemaTypeInfoFor } from '../type-info.js'
import type { PointerTarget } from '../relations/pointer.js'
import type { SchemaDeclaredFields, SchemaDefinition } from './definition.js'
import type {
	SourceFieldModeValue,
	SourceFieldObjectValue,
	SourceListItem,
	StoredSourceFields,
} from './source-fields.js'

interface NullFilter {
	readonly isNotNull?: true
	readonly isNull?: true
}

interface EqualityFilter<TValue> {
	readonly eq?: TValue
	readonly in?: readonly TValue[]
	readonly ne?: TValue
	readonly notIn?: readonly TValue[]
}

interface OrderedFilter<TValue> {
	readonly between?: Readonly<{
		readonly lower: TValue
		readonly upper: TValue
	}>
	readonly gt?: TValue
	readonly gte?: TValue
	readonly lt?: TValue
	readonly lte?: TValue
	readonly notBetween?: Readonly<{
		readonly lower: TValue
		readonly upper: TValue
	}>
}

interface StringFilter
	extends
		EqualityFilter<string | null>,
		OrderedFilter<string | null>,
		NullFilter {
	readonly contains?: string | null
	readonly endsWith?: string | null
	readonly matches?: Readonly<{
		readonly flags: readonly (
			'case-insensitive' | 'dot-matches-newline' | 'multiline'
		)[]
		readonly source: string
	}>
	readonly startsWith?: string | null
}

interface StructuralFilter<TValue, TKey extends PropertyKey = string>
	extends EqualityFilter<TValue>, NullFilter {
	readonly contains?: TValue
	readonly hasAllKeys?: readonly TKey[]
	readonly hasAnyKeys?: readonly TKey[]
	readonly hasKey?: TKey
}

interface ArrayFilter<TValue> extends NullFilter {
	readonly eq?: readonly TValue[] | null
	readonly has?: TValue
	readonly hasEvery?: readonly TValue[]
	readonly hasSome?: readonly TValue[]
	readonly isEmpty?: true
	readonly ne?: readonly TValue[] | null
}

type SourceScalarFilter<TField extends GenericField> =
	FieldTypeStateOf<TField>['list'] extends FieldList
		? ArrayFilter<SourceListItem<TField>>
		: TField['kind'] extends 'string'
			? StringFilter
			: TField['kind'] extends OrderedFieldKind
				? EqualityFilter<FieldValue<TField> | null> &
						OrderedFilter<FieldValue<TField> | null> &
						NullFilter
				: TField['kind'] extends Exclude<
							EqualityFieldKind,
							OrderedFieldKind | 'json' | 'pointer'
					  >
					? EqualityFilter<FieldValue<TField> | null> & NullFilter
					: SourcePluginContainmentFilter<TField>

/**
 * Plugin-owned structural containment (for example ACL `contains`): a field
 * type that declares its developer operand gets the exact `where` operator
 * without generated declarations (ADR-0297); otherwise the operand stays open.
 */
type SourcePluginContainmentFilter<TField extends GenericField> = [
	FieldStructuralContainsOperand<TField>,
] extends [never]
	? NullFilter
	: EqualityFilter<SourceFieldObjectValue<TField>> &
			Readonly<{
				readonly contains?: [FieldContainsInput<TField>] extends [never]
					? unknown
					: FieldContainsInput<TField>
			}> &
			NullFilter

type SourcePathScalarFilter<TField extends GenericField> =
	FieldTypeStateOf<TField>['list'] extends FieldList
		? ArrayFilter<SourceListItem<TField>>
		: TField['kind'] extends 'string'
			? Omit<StringFilter, keyof OrderedFilter<string | null>>
			: TField['kind'] extends 'json'
				? StructuralFilter<JsonDocument | null>
				: TField['kind'] extends 'object'
					? StructuralFilter<
							SourceFieldModeValue<TField, 'update'> | null,
							Extract<keyof NonNullable<SourceFieldObjectValue<TField>>, string>
						>
					: TField['kind'] extends Exclude<
								EqualityFieldKind,
								'json' | 'pointer'
						  >
						? EqualityFilter<FieldValue<TField> | null> & NullFilter
						: SourcePluginContainmentFilter<TField>

type SourceObjectPath<
	TFields extends ObjectFields,
	TParent extends readonly string[] = readonly [],
> = {
	[TKey in Extract<keyof TFields, string>]:
		| (Readonly<{ readonly path: readonly [...TParent, TKey] }> &
				SourcePathScalarFilter<TFields[TKey]>)
		| (FieldTypeStateOf<TFields[TKey]>['list'] extends true
				? never
				: TFields[TKey] extends {
							readonly kind: 'object'
							readonly options: {
								readonly fields: infer TChildren extends ObjectFields
							}
					  }
					? SourceObjectPath<TChildren, readonly [...TParent, TKey]>
					: never)
		| (FieldTypeStateOf<TFields[TKey]>['list'] extends true
				? never
				: TFields[TKey]['kind'] extends 'json'
					? Readonly<{
							readonly path: readonly [...TParent, TKey, string, ...string[]]
						}> &
							StructuralFilter<JsonValue>
					: never)
}[Extract<keyof TFields, string>]

type SourceObjectFilter<TField extends GenericField> = TField extends {
	readonly options: { readonly fields: infer TFields extends ObjectFields }
}
	? StructuralFilter<
			SourceFieldModeValue<TField, 'update'> | null,
			Extract<keyof NonNullable<SourceFieldObjectValue<TField>>, string>
		> &
			Readonly<{ readonly at?: readonly SourceObjectPath<TFields>[] }>
	: NullFilter

/**
 * Equality shorthand of a non-list scalar or enum field (ADR-0307): a value
 * means `eq` and `null` means `isNull`.
 */
type SourceEqualityShorthand<TField extends GenericField> =
	FieldTypeStateOf<TField>['list'] extends FieldList
		? never
		: TField['kind'] extends Exclude<EqualityFieldKind, 'json' | 'pointer'>
			? FieldValue<TField> | null
			: never

/**
 * Equality shorthand of a pointer field (ADR-0307): the target id or a
 * Pointer of the declared target means `eq`, `null` means `isNull`.
 */
type SourcePointerShorthand<TTarget extends SchemaDefinition> =
	string | PointerTarget<SchemaTypeInfoFor<TTarget>['key']> | null

type SourcePointerFilter<TTarget extends SchemaDefinition> = EqualityFilter<
	string | null
> &
	NullFilter &
	Readonly<{
		readonly is?: SchemaTypeInfoFor<TTarget>['inputs']['where']
		readonly isNot?: SchemaTypeInfoFor<TTarget>['inputs']['where']
	}>

type SourceRelationFilter<TTarget extends SchemaDefinition> = Readonly<{
	readonly count?: EqualityFilter<number | null> &
		OrderedFilter<number | null> &
		Readonly<{ readonly where?: SchemaTypeInfoFor<TTarget>['inputs']['where'] }>
	readonly every?: SchemaTypeInfoFor<TTarget>['inputs']['where']
	readonly isEmpty?: true
	readonly isNotEmpty?: true
	readonly none?: SchemaTypeInfoFor<TTarget>['inputs']['where']
	readonly some?: SchemaTypeInfoFor<TTarget>['inputs']['where']
}>

type SourceFieldFilter<TField extends GenericField> =
	TField extends PointerField<infer TTarget>
		? SourcePointerFilter<TTarget> | SourcePointerShorthand<TTarget>
		: TField extends RelationField<infer TTarget>
			? SourceRelationFilter<TTarget>
			: FieldTypeStateOf<TField>['list'] extends FieldList
				? ArrayFilter<SourceListItem<TField>>
				: TField['kind'] extends 'json'
					? StructuralFilter<JsonDocument | null> &
							Readonly<{
								readonly at?: readonly (Readonly<{
									readonly path: readonly [string, ...string[]]
								}> &
									StructuralFilter<JsonValue>)[]
							}>
					: TField['kind'] extends 'object'
						? SourceObjectFilter<TField>
						: SourceScalarFilter<TField> | SourceEqualityShorthand<TField>

export type SourceWhere<TFields extends SchemaDeclaredFields> = Readonly<
	{
		readonly AND?: readonly SourceWhere<TFields>[]
		readonly NOT?: SourceWhere<TFields>
		readonly OR?: readonly SourceWhere<TFields>[]
	} & {
		readonly [TKey in keyof StoredSourceFields<TFields>]?: SourceFieldFilter<
			StoredSourceFields<TFields>[TKey]
		>
	}
>
