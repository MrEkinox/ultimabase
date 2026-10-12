import type { FieldDeclarationContext } from '../schema/schema/field-contexts.js'
import type { PluginOperationDefinition } from './plugin-operations.js'
import type { SchemaDefinition } from '../schema/schema/definition.js'
import type {
	FieldDefinition,
	FieldSourceOptionByKind,
	FieldSourceObjectValue,
	FieldSourceOpaque,
	FieldSourceApply,
	FieldSourceHKT,
	FieldSourcePresentValue,
	FieldSourceValue,
	FieldTypeState,
	ResolveFieldSourceTemplate,
	ResolveFieldTypeState,
} from '../schema/fields/base/contract.js'
import type { RelationMutationDelta } from '../schema/relations/mutation.js'
import type {
	SchemaFieldsHKT,
	SchemaRulesHKT,
	SchemaShapeMethod,
	SchemaStaticsHKT,
} from './schema-extensions.js'
import type { SchemaFactoriesHKT } from './schema-factories.js'

declare const pluginSourceReceiptType: unique symbol
declare const pluginSourceRelationChangeType: unique symbol

/** Substitutes the exact declared field value inside one plugin option template. */
export type PluginSourceFieldValue = FieldSourceValue

/** Substitutes the exact persisted field value inside one plugin template. */
export type PluginSourceFieldObjectValue = FieldSourceObjectValue

/** Substitutes the persisted field value without `null` in one plugin template. */
export type PluginSourceFieldPresentValue = FieldSourcePresentValue

/** A plugin type function over one field's present value (see `PluginSourceFieldApply`). */
export type PluginSourceFieldHKT = FieldSourceHKT

/**
 * Applies one plugin type function to the field's present value, so the
 * option prints as the plugin's named type.
 * @example `PluginSourceFieldApply<FieldValidatorHKT>` prints `FieldValidator<string>`
 */
export type PluginSourceFieldApply<THKT extends FieldSourceHKT> =
	FieldSourceApply<THKT>

/** Selects exact plugin field options without treating relations as values. */
export type PluginSourceFieldOptionByKind<TValueOption, TRelationOption> =
	FieldSourceOptionByKind<TValueOption, TRelationOption>

/** Substitutes the exact logical relation mutation in one option template. */
export interface PluginSourceRelationChange {
	readonly [pluginSourceRelationChangeType]: true
}

/** Preserves one plugin-owned type while Core resolves neighboring source markers. */
export type PluginSourceOpaque<TValue> = FieldSourceOpaque<TValue>

/** Names every authoring surface one static plugin declaration may project. */
export interface PluginSourceProjection {
	readonly fieldBuilders?: Readonly<
		Partial<Record<FieldDeclarationContext, object>>
	>
	readonly fieldOptions?: Readonly<
		Partial<Record<FieldDeclarationContext, object>>
	>
	readonly operations?: Readonly<Record<string, PluginOperationDefinition>>
	/** Rule entries accepted by the final `.with({ ... })` (ADR-0297). */
	readonly schemaRules?: SchemaRulesHKT
	/** Callback-free shape methods chained before `.with(...)` (ADR-0297). */
	readonly shapeMethods?: Readonly<
		Record<string, SchemaShapeMethod<readonly unknown[], object>>
	>
	/** Fields added from the called shape methods (ADR-0316). */
	readonly shapeFields?: SchemaFieldsHKT
	/** Static members added to the configured schema (ADR-0316). */
	readonly schemaStatics?: SchemaStaticsHKT
	/** Schema factories added to the configured application (ADR-0322). */
	readonly schemaFactories?: SchemaFactoriesHKT
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
	readonly operations: Readonly<Record<never, never>>
	readonly schemaRules: readonly []
	readonly shapeMethods: Readonly<Record<never, never>>
	readonly shapeFields: readonly []
	readonly schemaStatics: readonly []
	readonly schemaFactories: readonly []
}

/** Complete source aggregate carried once by one configured factory. */
export interface PluginSourceState {
	readonly fieldBuilders: Readonly<
		Partial<Record<FieldDeclarationContext, object>>
	>
	readonly fieldOptions: Readonly<
		Partial<Record<FieldDeclarationContext, object>>
	>
	readonly operations: Readonly<Record<string, PluginOperationDefinition>>
	readonly schemaRules: readonly SchemaRulesHKT[]
	readonly shapeMethods: object
	readonly shapeFields: readonly SchemaFieldsHKT[]
	readonly schemaStatics: readonly SchemaStaticsHKT[]
	readonly schemaFactories: readonly SchemaFactoriesHKT[]
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
		FieldTypeState,
		infer TStructuralContainsOperand
	>
		? TResult &
				FieldDefinition<
					TKind,
					TValue,
					TDeclaredOptions,
					ResolveFieldTypeState<TDeclaredOptions>,
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
	TKey extends 'fieldBuilders' | 'fieldOptions' | 'operations' | 'shapeMethods',
> =
	UnionToIntersection<
		TProjection extends Readonly<Record<TKey, infer TValue extends object>>
			? TValue
			: object
	> extends infer TCombined extends object
		? TCombined
		: object

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
			readonly operations: TCurrent['operations'] &
				ObjectProjection<TAdded, 'operations'>
			readonly schemaRules: [RulesProjection<TAdded>] extends [never]
				? TCurrent['schemaRules']
				: readonly [...TCurrent['schemaRules'], RulesProjection<TAdded>]
			readonly shapeMethods: TCurrent['shapeMethods'] &
				ObjectProjection<TAdded, 'shapeMethods'>
			readonly shapeFields: AppendSlot<
				TCurrent['shapeFields'],
				SlotProjection<TAdded, 'shapeFields'>
			>
			readonly schemaStatics: AppendSlot<
				TCurrent['schemaStatics'],
				SlotProjection<TAdded, 'schemaStatics'>
			>
			readonly schemaFactories: AppendSlot<
				TCurrent['schemaFactories'],
				SlotProjection<TAdded, 'schemaFactories'>
			>
		}

type RulesProjection<TProjection> =
	TProjection extends Readonly<{ schemaRules: infer TRules }> ? TRules : never

// Slots are accumulated as tuples, like rules: intersecting `this`-typed
// interfaces directly makes TypeScript give up with TS2589.
type SlotProjection<
	TProjection,
	TKey extends 'shapeFields' | 'schemaStatics' | 'schemaFactories',
> = TProjection extends Readonly<Record<TKey, infer TSlot>> ? TSlot : never

type AppendSlot<TSlots extends readonly unknown[], TSlot> = [TSlot] extends [
	never,
]
	? TSlots
	: readonly [...TSlots, TSlot]

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
