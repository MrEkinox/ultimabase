import type {
	FieldTypeStateOf,
	GenericField,
} from '../fields/base/contract.js'
import type { PointerField } from '../fields/builtins/pointer.js'
import type { RelationField } from '../fields/builtins/relation.js'
import type {
	NestedPointerCreateInput,
	NestedPointerUpdateInput,
	NestedRelationCreateInput,
	NestedRelationUpdateInput,
} from '../nested-writes/inputs.js'
import type { NumericUpdateOperation } from '../../query/updates/contracts.js'
import type { SchemaTypeInfoFor, SchemaTypeInfoSource } from '../type-info.js'
import type { PointerTarget } from '../relations/pointer.js'
import type { SchemaDeclaredFields } from './definition.js'
import type {
	Simplify,
	SourceFieldModeValue,
	StoredSourceFields,
} from './source-fields.js'

type TargetNestedCreate<TTarget extends SchemaTypeInfoSource> =
	SchemaTypeInfoFor<TTarget>['inputs']['nestedCreate']

type TargetNestedUpdate<TTarget extends SchemaTypeInfoSource> =
	SchemaTypeInfoFor<TTarget>['inputs']['nestedUpdate']

type RelationNestedCreate<
	TTarget extends SchemaTypeInfoSource,
	TMappedBy extends string | undefined,
> = TMappedBy extends keyof TargetNestedCreate<TTarget>
	? Omit<TargetNestedCreate<TTarget>, TMappedBy>
	: TargetNestedCreate<TTarget>

type RelationCanDisconnect<
	TTarget extends SchemaTypeInfoSource,
	TMappedBy extends string | undefined,
> = TMappedBy extends keyof TargetNestedCreate<TTarget>
	? undefined extends TargetNestedCreate<TTarget>[TMappedBy]
		? true
		: false
	: true

type SourceNestedCreateValue<TField extends GenericField> =
	TField extends PointerField<infer TTarget>
		? | NestedPointerCreateInput<
					TargetNestedCreate<TTarget>,
					string | PointerTarget<SchemaTypeInfoFor<TTarget>['key']>
			  >
			| (FieldTypeStateOf<TField>['nullable'] extends true ? null : never)
		: TField extends RelationField<infer TTarget, infer TMappedBy>
			? NestedRelationCreateInput<
					RelationNestedCreate<TTarget, TMappedBy>,
					string | PointerTarget<SchemaTypeInfoFor<TTarget>['key']>
				>
			: SourceFieldModeValue<TField, 'create'>

/** Atomic operations of a non-list numeric field in nested update data (ADR-0307). */
type SourceNumericUpdateOperation<TField extends GenericField> =
	FieldTypeStateOf<TField>['list'] extends true
		? never
		: TField['kind'] extends 'bigint' | 'decimal' | 'float' | 'int'
			? NumericUpdateOperation<
					Exclude<SourceFieldModeValue<TField, 'update'>, null>
				>
			: never

type SourceNestedUpdateValue<TField extends GenericField> =
	TField extends PointerField<infer TTarget>
		? NestedPointerUpdateInput<
				TargetNestedCreate<TTarget>,
				TargetNestedUpdate<TTarget>,
				FieldTypeStateOf<TField>['nullable'],
				string | PointerTarget<SchemaTypeInfoFor<TTarget>['key']>
			>
		: TField extends RelationField<infer TTarget, infer TMappedBy>
			? NestedRelationUpdateInput<
					RelationNestedCreate<TTarget, TMappedBy>,
					TargetNestedUpdate<TTarget>,
					RelationCanDisconnect<TTarget, TMappedBy>,
					string | PointerTarget<SchemaTypeInfoFor<TTarget>['key']>
				>
			: | SourceFieldModeValue<TField, 'update'>
				| SourceNumericUpdateOperation<TField>

type SourceNestedCreateRequired<TFields extends SchemaDeclaredFields> = {
	-readonly [
		TKey in keyof StoredSourceFields<TFields> as StoredSourceFields<TFields>[TKey] extends RelationField
			? never
			: FieldTypeStateOf<
						StoredSourceFields<TFields>[TKey]
				  >['create'] extends 'required'
				? TKey
				: never
	]-?: SourceNestedCreateValue<StoredSourceFields<TFields>[TKey]>
}

type SourceNestedCreateOptional<TFields extends SchemaDeclaredFields> = {
	-readonly [
		TKey in keyof StoredSourceFields<TFields> as StoredSourceFields<TFields>[TKey] extends RelationField
			? TKey
			: FieldTypeStateOf<
						StoredSourceFields<TFields>[TKey]
				  >['create'] extends 'optional'
				? TKey
				: never
	]?: SourceNestedCreateValue<StoredSourceFields<TFields>[TKey]>
}

export type SourceNestedCreate<TFields extends SchemaDeclaredFields> = Simplify<
	SourceNestedCreateRequired<TFields> & SourceNestedCreateOptional<TFields>
>

export type SourceNestedUpdate<TFields extends SchemaDeclaredFields> = {
	-readonly [
		TKey in keyof StoredSourceFields<TFields> as StoredSourceFields<TFields>[TKey] extends RelationField
			? TKey
			: FieldTypeStateOf<
						StoredSourceFields<TFields>[TKey]
				  >['update'] extends 'forbidden'
				? never
				: TKey
	]?: SourceNestedUpdateValue<StoredSourceFields<TFields>[TKey]>
}
