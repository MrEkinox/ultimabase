import type { RelationField } from '../../schema/fields/builtins/relation.js'
import type { SchemaDefinition } from '../../schema/schema/definition.js'
import type { ResolveSchemaTarget } from '../../schema/schema/deferred-targets.js'
import type { SourceSchemaTypeInfo } from '../../schema/schema/source-type-info.js'
import type { SchemaTypeInfoCarrier } from '../../schema/type-info.js'
import type { Register } from '../../schema/schema/registered-schemas.js'
import type { SchemaRequiredRuleMessages } from '../../schema/schema/schema-declaration-chain.js'

declare const schemaRegistrationErrorType: unique symbol
declare const registerDeclarationRequiredType: unique symbol

/**
 * Takes the place of one invalid schema in `new App({ schemas })`; the message
 * names the declaration to fix.
 */
export interface SchemaRegistrationError<TMessage extends string> {
	readonly [schemaRegistrationErrorType]: TMessage
}

// Declared fields live in the source contract; `fields` itself is widened.
// The unique indexes are inferred too (a fixed argument would not match), and
// any of them is accepted.
type FieldsOf<TSchema> =
	TSchema extends SchemaTypeInfoCarrier<
		SourceSchemaTypeInfo<string, infer TFields, infer TUniqueIndexes>
	>
		? [TUniqueIndexes] extends [unknown]
			? TFields
			: never
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

// A declaration registered without the `.with` its `define` features
// require (`acl: true` without `.with({ acl: { … } })`, ADR-0339).
type RegistrationIssues<TSchema> =
	MappedByIssues<TSchema> | SchemaRequiredRuleMessages<TSchema>

/** Each registered schema, or a readable registration error in its place. */
export type CheckedSchemas<TSchemas extends readonly SchemaDefinition[]> = {
	readonly [TIndex in keyof TSchemas]: [
		RegistrationIssues<TSchemas[TIndex]>,
	] extends [never]
		? TSchemas[TIndex]
		: SchemaRegistrationError<RegistrationIssues<TSchemas[TIndex]>>
}

/**
 * Registration-time checks added to `new App({ schemas })` for an exact tuple;
 * an open array (built generically) is checked only at runtime.
 */
export type SchemaRegistrationChecks<
	TSchemas extends readonly SchemaDefinition[],
> = number extends TSchemas['length']
	? unknown
	: SchemaRegistrationCheck<TSchemas>

/** Registration-time checks of one exact schema tuple. */
export interface SchemaRegistrationCheck<
	TSchemas extends readonly SchemaDefinition[],
> {
	// Never an inference source: the schema tuple is inferred from `schemas` alone.
	readonly schemas: NoInfer<CheckedSchemas<TSchemas>>
}

/**
 * Takes the place of the application options until the application is
 * declared once in `Register` (ADR-0297 amendment 1): without it, rule
 * checking grows quadratically with the number of schemas.
 */
export interface RegisterDeclarationRequired<TMessage extends string> {
	readonly [registerDeclarationRequiredType]: TMessage
}

/**
 * Requires the `Register` declaration for an exact schema tuple. Only the
 * declared keys are read, never `typeof ultimabase`, so the check does not
 * depend on the application it constructs; an open array (built
 * generically) is not checked, like the other registration checks.
 */
export type RegisterDeclarationCheck<
	TSchemas extends readonly SchemaDefinition[],
> = number extends TSchemas['length']
	? unknown
	: 'app' extends keyof Register
		? unknown
		: RegisterDeclarationRequired<"Declare the application in Register: declare module '@ultimabase/core' { interface Register { readonly app: typeof ultimabase } }">
