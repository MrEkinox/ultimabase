import type { FieldDeclarationContext } from '../schema/schema/field-contexts.js'
import type { SchemaTypeInfo } from '../schema/type-info.js'
import type { PluginOperationDefinition } from './plugin-operations.js'
import type {
	SchemaClass,
	SchemaDefinition,
} from '../schema/schema/definition.js'
import type { SchemaSelectorOptions } from './schema-patch-contracts.js'
import type {
	FieldDefinition,
	FieldSourceOptionByKind,
	FieldSourceObjectValue,
	FieldSourceOpaque,
	FieldSourceValue,
	FieldTypegenState,
	ResolveFieldSourceTemplate,
	ResolveFieldTypegenState,
} from '../schema/fields/base/contract.js'
import type { RelationMutationDelta } from '../schema/relations/mutation.js'
import type { ResolveSourceSchemaTemplate } from './source-schema-templates.js'

declare const pluginSourceReceiptType: unique symbol
declare const pluginSourceRelationChangeType: unique symbol

/** Substitutes the exact declared field value inside one plugin option template. */
export type PluginSourceFieldValue = FieldSourceValue

/** Substitutes the exact persisted field value inside one plugin template. */
export type PluginSourceFieldObjectValue = FieldSourceObjectValue

/** Selects exact plugin field options without treating relations as values. */
export type PluginSourceFieldOptionByKind<TValueOption, TRelationOption> =
	FieldSourceOptionByKind<TValueOption, TRelationOption>

/** Substitutes the exact logical relation mutation in one option template. */
export interface PluginSourceRelationChange {
	readonly [pluginSourceRelationChangeType]: true
}

/** Preserves one plugin-owned type while Core resolves neighboring source markers. */
export type PluginSourceOpaque<TValue> = FieldSourceOpaque<TValue>

/** Restricts one schema projection to exact logical class names when supplied. */
export interface PluginSourceSchemaProjection<
	TTemplate extends object = object,
	TClassNames extends readonly string[] | undefined =
		readonly string[] | undefined,
	TSelector extends SchemaSelectorOptions | undefined =
		SchemaSelectorOptions | undefined,
> {
	readonly classNames?: TClassNames
	readonly selector?: TSelector
	readonly template: TTemplate
}

/** Names every authoring surface one static plugin declaration may project. */
export interface PluginSourceProjection {
	readonly fieldBuilders?: Readonly<
		Partial<Record<FieldDeclarationContext, object>>
	>
	readonly fieldOptions?: Readonly<
		Partial<Record<FieldDeclarationContext, object>>
	>
	readonly model?: PluginSourceSchemaProjection
	readonly operations?: Readonly<Record<string, PluginOperationDefinition>>
	readonly schemaClass?: PluginSourceSchemaProjection
	readonly schemaFields?: PluginSourceSchemaProjection
	readonly schemaOptions?: PluginSourceSchemaProjection
}

/** Carries one registrar call's source projection without exposing Runtime state. */
export interface PluginSourceReceipt<
	TProjection extends PluginSourceProjection = PluginSourceProjection,
> {
	readonly [pluginSourceReceiptType]: TProjection
}

/** Accepts one declaration receipt, a receipt group, or an existing void callback. */
export type PluginSourceDeclarationResult =
	PluginSourceReceipt | readonly PluginSourceDeclarationResult[] | undefined

/** Keeps the Runtime return inert while retaining the registrar's exact type. */
export const pluginSourceReceipt = <
	TProjection extends PluginSourceProjection,
>(): PluginSourceReceipt<TProjection> =>
	undefined as unknown as PluginSourceReceipt<TProjection>

type ProjectionFromDeclarationResult<TResult> =
	TResult extends PluginSourceReceipt<infer TProjection>
		? TProjection
		: TResult extends readonly (infer TEntry)[]
			? ProjectionFromDeclarationResult<TEntry>
			: never

/** Reads every projection returned by one static declaration callback. */
export type PluginSourceProjectionFromResult<TResult> =
	ProjectionFromDeclarationResult<TResult>

/** Empty aggregate owned by the zero-plugin configured factory. */
export interface EmptyPluginSourceState {
	readonly fieldBuilders: Readonly<Record<never, never>>
	readonly fieldOptions: Readonly<Record<never, never>>
	readonly model: never
	readonly operations: Readonly<Record<never, never>>
	readonly schemaClass: never
	readonly schemaFields: never
	readonly schemaOptions: never
}

/** Complete source aggregate carried once by one configured factory. */
export interface PluginSourceState {
	readonly fieldBuilders: Readonly<
		Partial<Record<FieldDeclarationContext, object>>
	>
	readonly fieldOptions: Readonly<
		Partial<Record<FieldDeclarationContext, object>>
	>
	readonly model: PluginSourceSchemaProjection
	readonly operations: Readonly<Record<string, PluginOperationDefinition>>
	readonly schemaClass: PluginSourceSchemaProjection
	readonly schemaFields: PluginSourceSchemaProjection
	readonly schemaOptions: PluginSourceSchemaProjection
}

/** Reads one contextual field or option surface from a configured source state. */
export type PluginSourceContextSurface<
	TSource extends PluginSourceState,
	TContext extends FieldDeclarationContext,
	TKey extends 'fieldBuilders' | 'fieldOptions',
> =
	TSource[TKey] extends Readonly<
		Record<TContext, infer TSurface extends object>
	>
		? TSurface
		: Readonly<Record<never, never>>

type ConfiguredPluginSourceFactoryResult<
	TResult,
	TDeclaredOptions extends object,
> =
	TResult extends FieldDefinition<
		infer TKind,
		infer TValue,
		object,
		FieldTypegenState,
		infer TStructuralContainsOperand
	>
		? TResult &
				FieldDefinition<
					TKind,
					TValue,
					TDeclaredOptions,
					ResolveFieldTypegenState<TDeclaredOptions>,
					TStructuralContainsOperand
				>
		: TResult

/** Adds exact plugin options without erasing field-factory option inference. */
export type ConfigurePluginSourceFactory<TFactory, TSourceOptions> = [
	keyof TSourceOptions,
] extends [never]
	? TFactory
	: TFactory extends (...arguments_: infer TArguments) => infer TResult
		? TArguments extends [infer TOptions extends object, ...infer TRest]
			? <const TDeclaredOptions extends TOptions & TSourceOptions>(
					options: TDeclaredOptions,
					...rest: TRest
				) => ConfiguredPluginSourceFactoryResult<TResult, TDeclaredOptions>
			: TFactory
		: TFactory

type UnionToIntersection<TValue> = (
	TValue extends unknown ? (value: TValue) => void : never
) extends (value: infer TIntersection) => void
	? TIntersection
	: never

type ObjectProjection<
	TProjection,
	TKey extends 'fieldBuilders' | 'fieldOptions' | 'operations',
> =
	UnionToIntersection<
		TProjection extends Readonly<Record<TKey, infer TValue extends object>>
			? TValue
			: object
	> extends infer TCombined extends object
		? TCombined
		: object

type SchemaProjection<
	TProjection,
	TKey extends 'model' | 'schemaClass' | 'schemaFields' | 'schemaOptions',
> =
	TProjection extends Readonly<
		Record<TKey, infer TValue extends PluginSourceSchemaProjection>
	>
		? TValue
		: never

/** Appends one plugin's inferred receipts to a previously composed source state. */
export type MergePluginSourceState<
	TCurrent extends PluginSourceState,
	TAdded,
> = [TAdded] extends [never]
	? TCurrent
	: {
			readonly fieldBuilders: TCurrent['fieldBuilders'] &
				ObjectProjection<TAdded, 'fieldBuilders'>
			readonly fieldOptions: TCurrent['fieldOptions'] &
				ObjectProjection<TAdded, 'fieldOptions'>
			readonly model: TCurrent['model'] | SchemaProjection<TAdded, 'model'>
			readonly operations: TCurrent['operations'] &
				ObjectProjection<TAdded, 'operations'>
			readonly schemaClass:
				TCurrent['schemaClass'] | SchemaProjection<TAdded, 'schemaClass'>
			readonly schemaFields:
				TCurrent['schemaFields'] | SchemaProjection<TAdded, 'schemaFields'>
			readonly schemaOptions:
				TCurrent['schemaOptions'] | SchemaProjection<TAdded, 'schemaOptions'>
		}

type ValueAtPath<TValue, TPath> = TPath extends readonly [
	infer TKey extends PropertyKey,
	...infer TRest,
]
	? TKey extends keyof TValue
		? ValueAtPath<TValue[TKey], TRest>
		: never
	: TValue

type SchemaOptionSelectorMatches<TSelector, TOptions extends object> =
	TSelector extends Readonly<{
		name: infer TName extends PropertyKey
		present: false
	}>
		? TName extends keyof TOptions
			? false
			: true
		: TSelector extends Readonly<{
					equals: infer TValue
					name: infer TName extends PropertyKey
					path?: infer TPath
			  }>
			? TName extends keyof TOptions
				? ValueAtPath<TOptions[TName], TPath> extends TValue
					? true
					: false
				: false
			: TSelector extends Readonly<{ name: infer TName extends PropertyKey }>
				? TName extends keyof TOptions
					? true
					: false
				: true

type SchemaSelectorMatches<
	TSelector,
	TContract extends SchemaTypeInfo,
	TOptions extends object,
> = TSelector extends SchemaSelectorOptions
	? TSelector extends Readonly<{
			owner: infer TOwner
		}>
		? TOwner extends Readonly<{ kind: 'application' }>
			? SchemaSelectorShapeMatches<TSelector, TContract, TOptions>
			: false
		: SchemaSelectorShapeMatches<TSelector, TContract, TOptions>
	: true

type SchemaSelectorShapeMatches<
	TSelector extends SchemaSelectorOptions,
	TContract extends SchemaTypeInfo,
	TOptions extends object,
> =
	TSelector extends Readonly<{ className: infer TClassName extends string }>
		? TContract['key'] extends TClassName
			? SchemaFieldSelectorMatches<TSelector, TContract, TOptions>
			: false
		: SchemaFieldSelectorMatches<TSelector, TContract, TOptions>

type SchemaFieldSelectorMatches<
	TSelector extends SchemaSelectorOptions,
	TContract extends SchemaTypeInfo,
	TOptions extends object,
> =
	TSelector extends Readonly<{
		field: Readonly<{
			kind?: infer TKind
			name: infer TName extends string
		}>
	}>
		? TName extends TContract['fields']
			? TKind extends string
				? TContract extends Readonly<{
						fieldKinds: Readonly<Record<TName, infer TFieldKind>>
					}>
					? TFieldKind extends TKind
						? SchemaOptionSelectorMatches<
								TSelector extends Readonly<{ option: infer TOption }>
									? TOption
									: never,
								TOptions
							>
						: false
					: false
				: SchemaOptionSelectorMatches<
						TSelector extends Readonly<{ option: infer TOption }>
							? TOption
							: never,
						TOptions
					>
			: false
		: SchemaOptionSelectorMatches<
				TSelector extends Readonly<{ option: infer TOption }> ? TOption : never,
				TOptions
			>

type ProjectionClassNamesMatch<
	TClassNames extends readonly string[] | undefined,
	TContract extends SchemaTypeInfo,
> = undefined extends TClassNames
	? true
	: TContract['key'] extends Extract<TClassNames, readonly string[]>[number]
		? true
		: false

type ProjectionSelectorMatch<
	TSelector extends SchemaSelectorOptions | undefined,
	TContract extends SchemaTypeInfo,
	TOptions extends object,
> = undefined extends TSelector
	? true
	: SchemaSelectorMatches<Exclude<TSelector, undefined>, TContract, TOptions>

/** Resolves every matching schema template against one exact source contract. */
export type ResolvePluginSchemaProjection<
	TProjection,
	TContract extends SchemaTypeInfo,
	TOptions extends object = Readonly<Record<never, never>>,
	TSchema extends SchemaDefinition = SchemaClass<TContract>,
> = [TProjection] extends [never]
	? Readonly<Record<never, never>>
	: UnionToIntersection<
				TProjection extends PluginSourceSchemaProjection<
					infer TTemplate,
					infer TClassNames,
					infer TSelector
				>
					? ProjectionClassNamesMatch<TClassNames, TContract> extends true
						? ProjectionSelectorMatch<
								TSelector,
								TContract,
								TOptions
							> extends true
							? ResolveSourceSchemaTemplate<TTemplate, TContract, TSchema>
							: object
						: object
					: object
		  > extends infer TResolved extends object
		? { readonly [TKey in keyof TResolved]: TResolved[TKey] }
		: object

/** Resolves field-option templates against exact declared and persisted values. */
export type ResolvePluginFieldTemplate<
	TTemplate,
	TValue,
	TObjectValue = never,
> = ResolveFieldSourceTemplate<TTemplate, TValue, TObjectValue>

/** Resolves one contextual plugin-option surface for an exact field value. */
export type ResolvePluginFieldSourceOptions<
	TSource extends PluginSourceState,
	TContext extends FieldDeclarationContext,
	TValue,
	TObjectValue = never,
> = Extract<
	ResolvePluginFieldTemplate<
		PluginSourceContextSurface<TSource, TContext, 'fieldOptions'>,
		TValue,
		TObjectValue
	>,
	object
>

type ResolvePluginRelationTemplate<
	TTemplate,
	TTarget extends SchemaDefinition,
> =
	TTemplate extends FieldSourceOptionByKind<unknown, infer TRelationOption>
		? ResolvePluginRelationTemplate<TRelationOption, TTarget>
		: TTemplate extends PluginSourceRelationChange
			? RelationMutationDelta<TTarget>
			: TTemplate extends PluginSourceOpaque<infer TValue>
				? TValue
				: TTemplate extends (...arguments_: infer TArguments) => infer TResult
					? (
							...arguments_: {
								[TIndex in keyof TArguments]: ResolvePluginRelationTemplate<
									TArguments[TIndex],
									TTarget
								>
							}
						) => ResolvePluginRelationTemplate<TResult, TTarget>
					: TTemplate extends Promise<infer TResult>
						? Promise<ResolvePluginRelationTemplate<TResult, TTarget>>
						: TTemplate extends PromiseLike<infer TResult>
							? PromiseLike<ResolvePluginRelationTemplate<TResult, TTarget>>
							: TTemplate extends readonly (infer TEntry)[]
								? readonly ResolvePluginRelationTemplate<TEntry, TTarget>[]
								: TTemplate extends object
									? {
											readonly [
												TKey in keyof TTemplate
											]: ResolvePluginRelationTemplate<TTemplate[TKey], TTarget>
										}
									: TTemplate

/** Resolves relation-only field options against the retained target graph. */
export type ResolvePluginRelationSourceOptions<
	TSource extends PluginSourceState,
	TTarget extends SchemaDefinition,
> = Extract<
	ResolvePluginRelationTemplate<
		PluginSourceContextSurface<TSource, 'stored', 'fieldOptions'>,
		TTarget
	>,
	object
>
