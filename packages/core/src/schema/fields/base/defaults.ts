/**
 * Produces one value when the runtime creates an object.
 */
export type DefaultFactory<TValue> = () => TValue

/**
 * Represents static data or runtime behavior without database-specific syntax.
 */
export type FieldDefault<TValue> = DefaultFactory<TValue> | TValue

/**
 * Narrows metadata to a static value without invoking executable defaults.
 */
export const isStaticDefault = <TValue>(
	value: FieldDefault<TValue>,
): value is TValue => typeof value !== 'function'
