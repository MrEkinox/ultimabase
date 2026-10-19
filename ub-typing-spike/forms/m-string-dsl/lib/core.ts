// Micro-test M: string field DSL (`title: 'string'`, `archived: 'boolean = false'`,
// `assignee: 'TodoUser?'`, `todos: 'Todo[] by assignee'`). Field strings are parsed with
// template literal types; schema names are resolved through the application registry.

import type { FieldsOf, FindManyArgs, PointerField, RegisteredNames, RelationField, Result, ScalarField, SystemFields } from './types.ts'

type ScalarTypes = { string: string; int: number; boolean: boolean; date: Date }
type ScalarName = keyof ScalarTypes

/** Accepted field syntax; schema names must start with an uppercase letter. */
export type FieldSyntax =
	| `${ScalarName}${'' | '?'}`
	| `${ScalarName}${'' | '?'} = ${string}`
	| `${Capitalize<string>}${'' | '?'}`
	| `${Capitalize<string>}[]${'' | ` by ${string}`}`

type Base<TType extends string, TRequired extends boolean> = TType extends ScalarName
	? ScalarField<TType, ScalarTypes[TType], TRequired>
	: TType extends `${infer TName}[] by ${infer TMappedBy}`
		? RelationField<TName, TMappedBy>
		: TType extends `${infer TName}[]`
			? RelationField<TName, undefined>
			: PointerField<TType, TRequired>

type Optional<TType extends string> = TType extends `${infer TInner}?` ? Base<TInner, false> : Base<TType, true>

/** Field type of one field string. A default makes the field optional on create. */
export type ParseField<TSyntax extends string> = TSyntax extends `${infer TType} = ${string}` ? Optional<`${TType}?`> : Optional<TSyntax>

type Parsed<TFields> = { readonly [K in keyof TFields]: TFields[K] extends string ? ParseField<TFields[K]> : never }

/** Static query surface. */
export interface SchemaQueries {
	findMany<TSelf, const TArgs extends FindManyArgs<TSelf> = Readonly<Record<never, never>>>(this: TSelf, args?: TArgs): Promise<Simplify<Result<TSelf, TArgs>>[]>
}
export type Simplify<TValue> = { [K in keyof TValue]: TValue[K] } & {}

/** One defined schema. */
export interface DefinedSchema<TName extends string, TFields> extends SchemaQueries {
	readonly className: TName
	readonly '~fields': Readonly<TFields & SystemFields>
}

export interface SchemaNamespace {
	define<const TName extends string, const TFields extends Readonly<Record<string, FieldSyntax>>>(declaration: {
		readonly className: TName
		readonly fields: TFields
	}): DefinedSchema<TName, Parsed<TFields>>
}

type NameOf<TSchema> = TSchema extends { readonly className: infer TName extends string } ? TName : never
type TargetName<TField> = TField extends { readonly '~target': infer TName } ? TName : never

type TargetIssues<TSchema, TList> = {
	[K in keyof FieldsOf<TSchema>]: FieldsOf<TSchema>[K] extends PointerField | RelationField
		? TargetName<FieldsOf<TSchema>[K]> extends NameOf<TList>
			? FieldsOf<TSchema>[K] extends RelationField<infer TTarget, infer TMappedBy extends string>
				? TMappedBy extends keyof FieldsOf<Extract<TList, { readonly className: TTarget }>>
					? never
					: `${NameOf<TSchema>}.${K & string}: mappedBy '${TMappedBy}' is not a field of ${TTarget & string}`
				: never
			: `${NameOf<TSchema>}.${K & string}: unknown schema '${TargetName<FieldsOf<TSchema>[K]> & string}'`
		: never
}[keyof FieldsOf<TSchema>]

export interface SchemaRegistrationError<TMessage extends string> {
	readonly '~error': TMessage
}

/** Checks targets against the listed schemas, never the registry (reading it here is a cycle: TS7022). */
export type CheckedSchemas<TSchemas extends readonly unknown[]> = {
	readonly [K in keyof TSchemas]: [TargetIssues<TSchemas[K], TSchemas[number]>] extends [never]
		? TSchemas[K]
		: SchemaRegistrationError<TargetIssues<TSchemas[K], TSchemas[number]>>
}

export interface Application<TSchemas extends readonly unknown[]> {
	readonly schemas: TSchemas
}

export interface Factory {
	readonly Schema: SchemaNamespace
	new <const TSchemas extends readonly unknown[]>(options: { readonly schemas: TSchemas & CheckedSchemas<TSchemas> }): Application<TSchemas>
}

export declare const App: Factory

/** Registered names, for diagnostics only. */
export type Names = RegisteredNames
