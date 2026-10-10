import type { FieldTypegenStateOf } from '../fields/base/contract.js'
import type { PointerField } from '../fields/builtins/pointer.js'
import type { RelationField } from '../fields/builtins/relation.js'
import type {
	SchemaInputsTypeInfo,
	SchemaRelationshipSourceCarrier,
	SchemaTypeInfo,
	SchemaTypeInfoFor,
	SchemaTypeInfoSource,
} from '../type-info.js'
import type { QueryPosition } from '../../query/query/input-contracts.js'
import type { SchemaDeclaredFields } from './definition.js'
import type {
	SourceDependencySelect,
	SourceFieldValueMap,
	SourceItem,
	SourceOrderBy,
	SourceOutput,
	SourceSelectableFieldName,
	SourceSelect,
	StoredSourceFields,
	VirtualSourceFields,
} from './source-fields.js'
import type { SourceWhere } from './source-filters.js'
import type {
	SourceNestedCreate,
	SourceNestedUpdate,
} from './source-nested-writes.js'

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
			/** Members strictly after this included row; not with `skip`. */
			readonly after?: QueryPosition
			readonly take?: number
			readonly skip?: number
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
