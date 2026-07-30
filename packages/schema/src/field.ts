declare const fieldValueMarker: unique symbol

/**
 * Describes whether a field may be omitted or contain null.
 *
 * Optional fields remain non-null by default, while required fields can never be nullable.
 */
export type FieldPresenceOptions =
	| {
			readonly required: true
			readonly nullable?: false
	  }
	| {
			readonly required?: false
			readonly nullable?: boolean
	  }

/**
 * Defines metadata shared by every field kind without introducing storage concerns.
 */
export type FieldOptions<TValue> = FieldPresenceOptions & {
	readonly default?: TValue
	readonly immutable?: boolean
	readonly unique?: boolean
	readonly index?: boolean
	readonly description?: string
}

/**
 * Carries immutable field metadata and its value type through schema inference.
 *
 * The symbol property exists only at the type level and does not add runtime metadata.
 */
export interface FieldDefinition<
	TKind extends string,
	TValue,
	TOptions extends FieldOptions<TValue> = FieldOptions<TValue>,
> {
	readonly kind: TKind
	readonly options: Readonly<TOptions>
	readonly [fieldValueMarker]?: TValue
}
