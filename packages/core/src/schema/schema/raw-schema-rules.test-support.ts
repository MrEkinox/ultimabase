// Test-only (ADR-0339): `.with((plugins) => …)` offers one typed method per
// installed rule, so it cannot pass a raw value or the option of a plugin
// the factory does not install. Runtime checks of such options (ownership,
// normalization, selectors) still guard plugin schema patches and untyped
// callers; this helper declares a schema exactly as `.with` does once it has
// read its rules, without the builder.
import {
	defineOrdinarySchemaModel,
	type SchemaFields,
	type SchemaOptions,
	type SchemaReference,
} from './definition.js'
import type { ReservedSchemaFieldCollision } from './reserved-field-names.js'

type RawSchemaOptions<
	TClassName extends string,
	TFields extends SchemaFields,
> = SchemaOptions<TClassName, TFields> &
	ReservedSchemaFieldCollision<NoInfer<TFields>>

/**
 * Declares one root schema whose `.with` rules are given raw, as an untyped
 * caller could write them before ADR-0339.
 *
 * @example `defineWithRawRules({ className: 'Post', fields: () => ({}) }, { audit: 'yes' })`
 */
export const defineWithRawRules = <
	const TClassName extends string,
	const TFields extends SchemaFields,
>(
	options: RawSchemaOptions<TClassName, TFields>,
	rules: Readonly<Record<string, unknown>>,
): SchemaReference<TClassName, TFields> => {
	// Relation filters join their relation field, as in `.with` (ADR-0328).
	const { relations, ...rest } = rules
	// Keys are copied as entries, `__proto__` included.
	const schema = defineOrdinarySchemaModel(
		Object.fromEntries([
			...Object.entries(options),
			...Object.entries(rest),
		]) as RawSchemaOptions<TClassName, TFields>,
		{},
		{ relations },
	)
	// The declared field types are those of `options.fields`.
	return schema as unknown as SchemaReference<TClassName, TFields>
}
