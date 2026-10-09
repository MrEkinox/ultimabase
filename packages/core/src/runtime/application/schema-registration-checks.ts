import type { RelationField } from '../../schema/fields/builtins/relation.js'
import type { SchemaDefinition } from '../../schema/schema/definition.js'
import type { ResolveSchemaTarget } from '../../schema/schema/deferred-targets.js'
import type { SourceSchemaTypeInfo } from '../../schema/schema/source-type-info.js'
import type { SchemaTypeInfoCarrier } from '../../schema/type-info.js'

declare const schemaRegistrationErrorType: unique symbol

/**
 * Takes the place of one invalid schema in `new App({ schemas })`; the message
 * names the declaration to fix.
 */
export interface SchemaRegistrationError<TMessage extends string> {
	readonly [schemaRegistrationErrorType]: TMessage
}

// Declared fields live in the source contract; `fields` itself is widened.
type FieldsOf<TSchema> =
	TSchema extends SchemaTypeInfoCarrier<
		SourceSchemaTypeInfo<string, infer TFields>
	>
		? TFields
		: never

type ClassNameOf<TSchema> = TSchema extends {
	readonly className: infer TClassName extends string
}
	? TClassName
	: never

// A thunk target is not read while its schema is declared, so `mappedBy` is
// checked here, once every registered schema is typed (ADR-0297).
type MappedByIssues<TSchema> = {
	[
		TName in keyof FieldsOf<TSchema>
	]: FieldsOf<TSchema>[TName] extends RelationField<
		infer TTarget,
		infer TMappedBy
	>
		? TMappedBy extends string
			? TMappedBy extends keyof FieldsOf<ResolveSchemaTarget<TTarget>>
				? never
				: `${ClassNameOf<TSchema>}.${TName & string}: mappedBy '${TMappedBy}' is not a field of ${ClassNameOf<ResolveSchemaTarget<TTarget>>}`
			: never
		: never
}[keyof FieldsOf<TSchema>]

/** Each registered schema, or a readable registration error in its place. */
export type CheckedSchemas<TSchemas extends readonly SchemaDefinition[]> = {
	readonly [TIndex in keyof TSchemas]: [
		MappedByIssues<TSchemas[TIndex]>,
	] extends [never]
		? TSchemas[TIndex]
		: SchemaRegistrationError<MappedByIssues<TSchemas[TIndex]>>
}

/** Registration-time checks added to `new App({ schemas })`. */
export interface SchemaRegistrationCheck<
	TSchemas extends readonly SchemaDefinition[],
> {
	readonly schemas: CheckedSchemas<TSchemas>
}
