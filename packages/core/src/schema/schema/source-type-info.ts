import type {
	FieldTypegenStateOf,
	FieldValue,
	GenericField,
} from '../fields/base/contract.js'
import type { FieldValueMap } from '../fields/base/value-map.js'
import type { PointerField } from '../fields/builtins/pointer.js'
import type { RelationField } from '../fields/builtins/relation.js'
import type {
	NestedPointerCreateInput,
	NestedPointerUpdateInput,
	NestedRelationCreateInput,
	NestedRelationUpdateInput,
} from '../nested-writes/inputs.js'
import type { OutputValue } from '../output/contracts.js'
import type { PointerValue } from '../relations/pointer.js'
import type {
	SchemaInputsTypeInfo,
	SchemaRelationshipSourceCarrier,
	SchemaTypeInfo,
	SchemaTypeInfoFor,
	SchemaTypeInfoSource,
} from '../type-info.js'
import type { SchemaDeclaredFields } from './definition.js'
import type { SourceWhere } from './source-filters.js'
import type { SystemFields } from './system-fields.js'
import type { GenericVirtualField } from './virtual-field.js'

/*
 * Derives a schema's local type contract directly from its captured source
 * field map, so `App.Schema.define` results are typed before Typegen runs.
 */

type Simplify<TValue> = {
	readonly [TKey in keyof TValue]: TValue[TKey]
}

type DeveloperStoredSourceFields<TFields extends SchemaDeclaredFields> = {
	readonly [
		TKey in keyof TFields as TFields[TKey] extends GenericVirtualField
			? never
			: TFields[TKey] extends GenericField
				? TKey
				: never
	]: TFields[TKey]
}

export type StoredSourceFields<TFields extends SchemaDeclaredFields> = Simplify<
	Omit<DeveloperStoredSourceFields<TFields>, keyof SystemFields> & SystemFields
>

type VirtualSourceFields<TFields extends SchemaDeclaredFields> = {
	readonly [
		TKey in keyof TFields as TFields[TKey] extends GenericVirtualField
			? TKey
			: never
	]: TFields[TKey]
}

type SourceItem<TFields extends SchemaDeclaredFields> = Simplify<
	Omit<
		FieldValueMap<StoredSourceFields<TFields>, 'object'>,
		keyof SystemFields
	> &
		Readonly<{
			readonly createdAt: string
			readonly id: string
			readonly updatedAt: string
		}>
>

type SourceVirtualValues<TFields extends SchemaDeclaredFields> = {
	readonly [
		TKey in keyof VirtualSourceFields<TFields>
	]: VirtualSourceFields<TFields>[TKey] extends GenericVirtualField
		? OutputValue<VirtualSourceFields<TFields>[TKey]['output']>
		: never
}

type SourceOutput<TFields extends SchemaDeclaredFields> = Simplify<
	SourceItem<TFields> & SourceVirtualValues<TFields>
>

type FieldIsPresent<
	TField,
	TMode extends 'create' | 'object' | 'update',
> = TField extends GenericField
	? FieldTypegenStateOf<TField>[TMode] extends 'forbidden'
		? false
		: true
	: false

type SourceSelectableFieldName<TFields extends SchemaDeclaredFields> =
	| {
			[TKey in keyof StoredSourceFields<TFields>]: FieldIsPresent<
				StoredSourceFields<TFields>[TKey],
				'object'
			> extends true
				? TKey
				: never
	  }[keyof StoredSourceFields<TFields>]
	| keyof VirtualSourceFields<TFields>

type SourceSelect<TFields extends SchemaDeclaredFields> = Readonly<{
	[
		TKey in Extract<SourceSelectableFieldName<TFields>, string>
	]?: TKey extends 'id' ? true : boolean
}>

type SourceDependencySelect<TFields extends SchemaDeclaredFields> = Readonly<{
	[
		TKey in keyof StoredSourceFields<TFields> as StoredSourceFields<TFields>[TKey] extends {
			readonly kind: 'relation'
		}
			? never
			: TKey
	]?: TKey extends 'id' ? true : boolean
}>

type SourceOrderBy<TFields extends SchemaDeclaredFields> = Readonly<{
	[TKey in keyof StoredSourceFields<TFields>]?: 'asc' | 'desc' | null
}>

export type SourceFieldObjectValue<TField extends GenericField> =
	FieldValueMap<
		Readonly<{ readonly value: TField }>,
		'object'
	> extends Readonly<{ readonly value: infer TValue }>
		? TValue
		: never

export type SourceFieldModeValue<
	TField extends GenericField,
	TMode extends 'create' | 'object' | 'update',
> =
	FieldValueMap<Readonly<{ readonly value: TField }>, TMode> extends Readonly<{
		readonly value?: infer TValue
	}>
		? TValue
		: never

type SourceMutationFieldValue<
	TField extends GenericField,
	TValue,
> = TField extends { readonly kind: 'pointer' }
	? FieldTypegenStateOf<TField>['nullable'] extends true
		? PointerValue | null
		: PointerValue
	: TValue

/** Reuses Core presence rules while projecting pointer writes to portable values. */
type SourceFieldValueMap<
	TFields extends SchemaDeclaredFields,
	TMode extends 'create' | 'update',
> = {
	[
		TKey in keyof FieldValueMap<StoredSourceFields<TFields>, TMode>
	]: TKey extends keyof StoredSourceFields<TFields>
		? SourceMutationFieldValue<
				StoredSourceFields<TFields>[TKey],
				FieldValueMap<StoredSourceFields<TFields>, TMode>[TKey]
			>
		: never
}

export type SourceListItem<TField extends GenericField> =
	FieldValue<TField> extends readonly (infer TValue)[] ? TValue : never

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
		? NestedPointerCreateInput<TargetNestedCreate<TTarget>>
		: TField extends RelationField<infer TTarget, infer TMappedBy>
			? NestedRelationCreateInput<RelationNestedCreate<TTarget, TMappedBy>>
			: SourceFieldModeValue<TField, 'create'>

type SourceNestedUpdateValue<TField extends GenericField> =
	TField extends PointerField<infer TTarget>
		? NestedPointerUpdateInput<
				TargetNestedCreate<TTarget>,
				TargetNestedUpdate<TTarget>,
				FieldTypegenStateOf<TField>['nullable']
			>
		: TField extends RelationField<infer TTarget, infer TMappedBy>
			? NestedRelationUpdateInput<
					RelationNestedCreate<TTarget, TMappedBy>,
					TargetNestedUpdate<TTarget>,
					RelationCanDisconnect<TTarget, TMappedBy>
				>
			: SourceFieldModeValue<TField, 'update'>

type SourceNestedCreateRequired<TFields extends SchemaDeclaredFields> = {
	-readonly [
		TKey in keyof StoredSourceFields<TFields> as StoredSourceFields<TFields>[TKey] extends RelationField
			? never
			: FieldTypegenStateOf<
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
			: FieldTypegenStateOf<
						StoredSourceFields<TFields>[TKey]
				  >['create'] extends 'optional'
				? TKey
				: never
	]?: SourceNestedCreateValue<StoredSourceFields<TFields>[TKey]>
}

type SourceNestedCreate<TFields extends SchemaDeclaredFields> = Simplify<
	SourceNestedCreateRequired<TFields> & SourceNestedCreateOptional<TFields>
>

type SourceNestedUpdate<TFields extends SchemaDeclaredFields> = {
	-readonly [
		TKey in keyof StoredSourceFields<TFields> as StoredSourceFields<TFields>[TKey] extends RelationField
			? TKey
			: FieldTypegenStateOf<
						StoredSourceFields<TFields>[TKey]
				  >['update'] extends 'forbidden'
				? never
				: TKey
	]?: SourceNestedUpdateValue<StoredSourceFields<TFields>[TKey]>
}

type RelationshipTarget<TField> =
	TField extends PointerField<infer TTarget>
		? TTarget
		: TField extends RelationField<infer TTarget>
			? TTarget
			: never

type SourceIncludeTarget<TTarget extends SchemaTypeInfoSource> = Readonly<{
	readonly include?: SchemaTypeInfoFor<TTarget>['inputs']['include']
	readonly select?: SchemaTypeInfoFor<TTarget>['inputs']['select']
}>

type SourceRelationIncludeTarget<TTarget extends SchemaTypeInfoSource> =
	SourceIncludeTarget<TTarget> &
		Readonly<{
			readonly limit?: number
			readonly offset?: number
			readonly orderBy?: SchemaTypeInfoFor<TTarget>['inputs']['orderBy']
			readonly where?: SchemaTypeInfoFor<TTarget>['inputs']['where']
		}>

type SourceInclude<TFields extends SchemaDeclaredFields> = Readonly<{
	[
		TKey in keyof StoredSourceFields<TFields> as StoredSourceFields<TFields>[TKey] extends {
			readonly kind: 'pointer'
		}
			? TKey
			: StoredSourceFields<TFields>[TKey] extends {
						readonly kind: 'relation'
				  }
				? TKey
				: never
	]?: StoredSourceFields<TFields>[TKey] extends {
		readonly kind: 'relation'
	}
		? SourceRelationIncludeTarget<
				RelationshipTarget<StoredSourceFields<TFields>[TKey]>
			>
		: SourceIncludeTarget<RelationshipTarget<StoredSourceFields<TFields>[TKey]>>
}>

type SourceRelationshipMap<TFields extends SchemaDeclaredFields> = Readonly<{
	[
		TKey in keyof StoredSourceFields<TFields> as StoredSourceFields<TFields>[TKey] extends {
			readonly kind: 'pointer' | 'relation'
		}
			? TKey
			: never
	]: StoredSourceFields<TFields>[TKey] extends PointerField<infer TTarget>
		? Readonly<{
				readonly kind: 'pointer'
				readonly target: TTarget['className']
			}> &
				SchemaRelationshipSourceCarrier<TTarget>
		: StoredSourceFields<TFields>[TKey] extends RelationField<infer TTarget>
			? Readonly<{
					readonly kind: 'relation'
					readonly target: TTarget['className']
				}> &
					SchemaRelationshipSourceCarrier<TTarget>
			: never
}>

type SourceNumericFieldName<TFields extends SchemaDeclaredFields> = {
	[
		TKey in keyof StoredSourceFields<TFields>
	]: StoredSourceFields<TFields>[TKey]['kind'] extends
		'bigint' | 'decimal' | 'float' | 'int'
		? FieldTypegenStateOf<
				StoredSourceFields<TFields>[TKey]
			>['list'] extends true
			? never
			: TKey
		: never
}[keyof StoredSourceFields<TFields>]

interface SourceSchemaInputs<
	TFields extends SchemaDeclaredFields,
> extends SchemaInputsTypeInfo {
	readonly create: SourceFieldValueMap<TFields, 'create'>
	readonly dependencySelect: SourceDependencySelect<TFields>
	readonly include: SourceInclude<TFields>
	readonly nestedCreate: SourceNestedCreate<TFields>
	readonly nestedUpdate: SourceNestedUpdate<TFields>
	readonly orderBy: SourceOrderBy<TFields>
	readonly select: SourceSelect<TFields>
	readonly update: SourceFieldValueMap<TFields, 'update'>
	readonly where: SourceWhere<TFields>
}

/** Derives every local schema contract from one captured source field map. */
export interface SourceSchemaTypeInfo<
	TClassName extends string,
	TFields extends SchemaDeclaredFields,
> extends SchemaTypeInfo {
	readonly fieldKinds: Readonly<{
		[TName in keyof TFields]: TFields[TName]['kind']
	}>
	readonly fields: Extract<
		keyof StoredSourceFields<TFields> | keyof VirtualSourceFields<TFields>,
		string
	>
	readonly inputs: SourceSchemaInputs<TFields>
	readonly item: SourceItem<TFields>
	readonly key: TClassName
	readonly numericFields: Extract<SourceNumericFieldName<TFields>, string>
	readonly output: SourceOutput<TFields>
	readonly persistedFields: Extract<keyof StoredSourceFields<TFields>, string>
	readonly relationships: SourceRelationshipMap<TFields>
	readonly selectableFields: Extract<SourceSelectableFieldName<TFields>, string>
}
