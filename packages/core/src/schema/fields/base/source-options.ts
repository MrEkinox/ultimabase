declare const fieldSourceObjectValueType: unique symbol
declare const fieldSourcePresentValueType: unique symbol
declare const fieldSourceApplyType: unique symbol
declare const fieldSourceOpaqueType: unique symbol
declare const fieldSourceValueType: unique symbol
declare const fieldSourceOptionByKindType: unique symbol
declare const pluginSourceFieldOptionType: unique symbol
declare const resolvedPluginSourceFieldOptionConstraintType: unique symbol

/** Substitutes the exact declared field value inside one option template. */
export interface FieldSourceValue {
	readonly [fieldSourceValueType]: 'field-value'
}

/** Substitutes the exact persisted field value inside one option template. */
export interface FieldSourceObjectValue {
	readonly [fieldSourceObjectValueType]: 'field-object-value'
}

/** Substitutes the persisted field value without `null`, as a field hook receives it. */
export interface FieldSourcePresentValue {
	readonly [fieldSourcePresentValueType]: 'field-present-value'
}

/**
 * A plugin type function over one field's present (non-null) value: Core
 * reads `type` with `value` set, so the option prints as the plugin's named
 * type (`FieldValidator<string>`).
 */
export interface FieldSourceHKT {
	readonly value: unknown
	readonly type: unknown
}

/** Applies one plugin type function to the field's present value. */
export interface FieldSourceApply<THKT extends FieldSourceHKT> {
	readonly [fieldSourceApplyType]: THKT
}

/** Preserves one plugin-owned type while Core resolves neighboring field markers. */
export interface FieldSourceOpaque<TValue> {
	readonly [fieldSourceOpaqueType]: TValue
}

/** Selects one plugin option template for values and another for relations. */
export interface FieldSourceOptionByKind<TValueOption, TRelationOption> {
	readonly [fieldSourceOptionByKindType]: Readonly<{
		relation: TRelationOption
		value: TValueOption
	}>
}

/**
 * Evaluates one plugin-owned constraint after exact field options are
 * inferred: `true` accepts, `false` rejects, and a message string rejects with
 * that message as the expected type of the option (ADR-0319).
 */
export interface PluginSourceFieldOptionConstraint {
	readonly options: object
	readonly valid: boolean | string
	readonly value: unknown
}

/** Couples one contextual source type to a post-inference compatibility check. */
export interface PluginSourceFieldOption<
	TTemplate,
	TConstraint extends PluginSourceFieldOptionConstraint,
> {
	readonly [pluginSourceFieldOptionType]: Readonly<{
		constraint: TConstraint
		template: TTemplate
	}>
}

interface ResolvedPluginSourceFieldOption<
	TTemplate,
	TConstraint extends PluginSourceFieldOptionConstraint,
> {
	readonly [resolvedPluginSourceFieldOptionConstraintType]?: TConstraint
	readonly value: TTemplate
}

type ResolvePluginSourceFieldOption<
	TTemplate,
	TConstraint extends PluginSourceFieldOptionConstraint,
> = TTemplate &
	Omit<ResolvedPluginSourceFieldOption<TTemplate, TConstraint>, 'value'>

/** Resolves one application-local option template for an exact field value. */
export type ResolveFieldSourceTemplate<
	TTemplate,
	TValue,
	TObjectValue = never,
> = TTemplate extends FieldSourceObjectValue
	? [TObjectValue] extends [never]
		? TTemplate
		: TObjectValue
	: TTemplate extends FieldSourcePresentValue
		? [TObjectValue] extends [never]
			? TTemplate
			: Exclude<TObjectValue, null>
		: TTemplate extends FieldSourceApply<infer THKT>
			? [TObjectValue] extends [never]
				? TTemplate
				: (THKT & { readonly value: Exclude<TObjectValue, null> })['type']
			: TTemplate extends FieldSourceOpaque<infer TValue>
				? TValue
				: TTemplate extends FieldSourceOptionByKind<infer TValueOption, unknown>
					? ResolveFieldSourceTemplate<TValueOption, TValue, TObjectValue>
					: TTemplate extends PluginSourceFieldOption<
								infer TOptionTemplate,
								infer TConstraint
						  >
						? ResolvePluginSourceFieldOption<
								ResolveFieldSourceTemplate<
									TOptionTemplate,
									TValue,
									TObjectValue
								>,
								TConstraint
							>
						: TTemplate extends FieldSourceValue
							? TValue
							: TTemplate extends (
										...arguments_: infer TArguments
								  ) => infer TResult
								? (
										...arguments_: {
											[TIndex in keyof TArguments]: ResolveFieldSourceTemplate<
												TArguments[TIndex],
												TValue,
												TObjectValue
											>
										}
									) => ResolveFieldSourceTemplate<TResult, TValue, TObjectValue>
								: TTemplate extends Promise<infer TResult>
									? Promise<
											ResolveFieldSourceTemplate<TResult, TValue, TObjectValue>
										>
									: TTemplate extends PromiseLike<infer TResult>
										? PromiseLike<
												ResolveFieldSourceTemplate<
													TResult,
													TValue,
													TObjectValue
												>
											>
										: TTemplate extends readonly (infer TEntry)[]
											? readonly ResolveFieldSourceTemplate<
													TEntry,
													TValue,
													TObjectValue
												>[]
											: TTemplate extends object
												? {
														readonly [
															TKey in keyof TTemplate
														]: ResolveFieldSourceTemplate<
															TTemplate[TKey],
															TValue,
															TObjectValue
														>
													}
												: TTemplate

type PluginSourceFieldOptionConstraintAt<TOption> =
	typeof resolvedPluginSourceFieldOptionConstraintType extends keyof NonNullable<TOption>
		? NonNullable<
				NonNullable<TOption>[typeof resolvedPluginSourceFieldOptionConstraintType]
			>
		: never

type PluginSourceFieldOptionIsValid<TOption, TOptions extends object, TValue> =
	PluginSourceFieldOptionConstraintAt<TOption> extends infer TConstraint extends
		PluginSourceFieldOptionConstraint
		? (TConstraint &
				Readonly<{
					options: TOptions
					value: TValue
				}>)['valid']
		: true

type PluginSourceFieldOptionValidity<
	TSourceOptions extends object,
	TOptions extends object,
	TValue,
> = {
	readonly [TKey in keyof TSourceOptions]-?: TOptions extends Readonly<
		Record<TKey, unknown>
	>
		? PluginSourceFieldOptionIsValid<TSourceOptions[TKey], TOptions, TValue>
		: true
}

/** Keeps the options whose constraint answered with a message. */
type PluginSourceFieldOptionMessages<TValidity> = {
	readonly [
		TKey in keyof TValidity as [TValidity[TKey]] extends [never]
			? never
			: TValidity[TKey] extends string
				? TKey
				: never
	]: TValidity[TKey]
}

/**
 * Applies every generic plugin constraint after exact source options are
 * inferred; an option rejected with a message expects that message, so the
 * editor shows it on the option.
 */
export type CompatiblePluginSourceFieldOptions<
	TSourceOptions extends object,
	TOptions extends object,
	TValue,
> =
	PluginSourceFieldOptionValidity<
		TSourceOptions,
		TOptions,
		TValue
	> extends infer TValidity
		? false extends TValidity[keyof TValidity]
			? never
			: keyof PluginSourceFieldOptionMessages<TValidity> extends never
				? unknown
				: PluginSourceFieldOptionMessages<TValidity>
		: never
