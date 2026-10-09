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

type RegistrationClassNameOf<TSchema> = TSchema extends {
	readonly className: infer TClassName extends string
}
	? TClassName
	: never

// Only exact declarations are checked: widened field maps and targets whose
// declared fields are unknown here (generated or bootstrap contracts) are skipped.
type IsExactFieldMap<TFields> = [TFields] extends [never]
	? false
	: unknown extends TFields
		? false
		: string extends keyof TFields
			? false
			: true

type MappedByIssue<
	TSchema,
	TName extends PropertyKey,
	TTarget,
	TMappedBy,
> = TMappedBy extends string
	? string extends TMappedBy
		? never
		: IsExactFieldMap<FieldsOf<TTarget>> extends true
			? TMappedBy extends keyof FieldsOf<TTarget>
				? never
				: `${RegistrationClassNameOf<TSchema>}.${TName & string}: mappedBy '${TMappedBy}' is not a field of ${RegistrationClassNameOf<TTarget>}`
			: never
	: never

// A thunk target is not read while its schema is declared, so `mappedBy` is
// checked here, once every registered schema is typed (ADR-0297).
type MappedByIssues<TSchema> =
	string extends RegistrationClassNameOf<TSchema>
		? never
		: IsExactFieldMap<FieldsOf<TSchema>> extends true
			? {
					[
						TName in keyof FieldsOf<TSchema>
					]: FieldsOf<TSchema>[TName] extends RelationField<
						infer TTarget,
						infer TMappedBy
					>
						? MappedByIssue<
								TSchema,
								TName,
								ResolveSchemaTarget<TTarget>,
								TMappedBy
							>
						: never
				}[keyof FieldsOf<TSchema>]
			: never

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
	// Never an inference source: the schema tuple is inferred from `schemas` alone.
	readonly schemas: NoInfer<CheckedSchemas<TSchemas>>
}
