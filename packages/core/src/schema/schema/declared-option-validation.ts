// Old-form `define` option validation (until step 6.8), kept apart from the
// configured namespace it serves.
type KeysOfUnion<TValue> = TValue extends unknown ? keyof TValue : never

type UnionValueAtKey<TValue, TKey extends PropertyKey> = TValue extends unknown
	? TKey extends keyof TValue
		? TValue[TKey]
		: never
	: never

type RemainingDepth<TDepth extends readonly unknown[]> =
	TDepth extends readonly [unknown, ...infer TRest] ? TRest : readonly []

type ValidateDeclaredSourceValue<
	TDeclared,
	TExpected,
	TDepth extends readonly unknown[],
> = TDepth extends readonly []
	? TDeclared
	: TDeclared extends (...arguments_: never[]) => unknown
		? TDeclared
		: TDeclared extends readonly unknown[]
			? TDeclared
			: TDeclared extends object
				? {
						readonly [TKey in keyof TDeclared]: TKey extends KeysOfUnion<
							NonNullable<TExpected>
						>
							? ValidateDeclaredSourceValue<
									TDeclared[TKey],
									UnionValueAtKey<NonNullable<TExpected>, TKey>,
									RemainingDepth<TDepth>
								>
							: never
					}
				: TDeclared

/** Checks declared plugin option values against their source-typed shape. */
export type ConfiguredDeclaredOptionValidation<
	TDeclaredOptions extends object,
	TSourceOptions extends object,
> = {
	readonly [
		TName in keyof TDeclaredOptions as TName extends keyof TSourceOptions
			? TName
			: never
	]: ValidateDeclaredSourceValue<
		TDeclaredOptions[TName],
		TName extends keyof TSourceOptions ? TSourceOptions[TName] : never,
		readonly [unknown, unknown, unknown, unknown, unknown, unknown]
	>
}
