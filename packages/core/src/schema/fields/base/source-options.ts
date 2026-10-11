declare const fieldSourceObjectValueType: unique symbol
declare const fieldSourcePresentValueType: unique symbol
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

/** Evaluates one plugin-owned constraint after exact field options are inferred. */
export interface PluginSourceFieldOptionConstraint {
	readonly options: object
	readonly valid: boolean
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
	: TTemplate extends FieldSourceOpaque<infer TValue>
		? TValue
		: TTemplate extends FieldSourceOptionByKind<infer TValueOption, unknown>
			? ResolveFieldSourceTemplate<TValueOption, TValue, TObjectValue>
			: TTemplate extends PluginSourceFieldOption<
						infer TOptionTemplate,
						infer TConstraint
				  >
				? ResolvePluginSourceFieldOption<
						ResolveFieldSourceTemplate<TOptionTemplate, TValue, TObjectValue>,
						TConstraint
					>
				: TTemplate extends FieldSourceValue
					? TValue
					: TTemplate extends (...arguments_: infer TArguments) => infer TResult
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
										ResolveFieldSourceTemplate<TResult, TValue, TObjectValue>
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

/** Applies every generic plugin constraint after exact source options are inferred. */
export type CompatiblePluginSourceFieldOptions<
	TSourceOptions extends object,
	TOptions extends object,
	TValue,
> = false extends {
	readonly [TKey in keyof TSourceOptions]: TOptions extends Readonly<
		Record<TKey, unknown>
	>
		? PluginSourceFieldOptionIsValid<TSourceOptions[TKey], TOptions, TValue>
		: true
}[keyof TSourceOptions]
	? never
	: unknown
