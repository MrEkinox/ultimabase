import type {
	SchemaDefinition,
	SchemaFields,
	SchemaMetadata,
} from './definition.js'
import type { SchemaItem, SchemaOutput } from './values.js'

/** Materializes one projection so editor QuickInfo hides the source object. */
type Simplify<TValue> = {
	readonly [TKey in keyof TValue]: TValue[TKey]
} & {}

/**
 * One persisted result of a schema: frozen plain data without methods
 * (ADR-0310). `TValues` narrows it to a selected projection.
 */
export type SchemaResult<
	TSchema extends SchemaDefinition,
	TValues extends object = SchemaOutput<TSchema>,
> = Simplify<Readonly<TValues>>

/** One complete normalized create candidate, as plain data. */
export type SchemaPreparedDraft<TSchema extends SchemaDefinition> = Simplify<
	Readonly<SchemaItem<TSchema>>
>

/** Resolves metadata only after an application's static schema compilation. */
export interface SchemaModelDefinitionReader<
	TClassName extends string,
	TFields extends SchemaFields,
> {
	readonly className: TClassName
	readonly readDefinition: () => SchemaMetadata<TClassName, TFields>
	readonly readDeveloperFields: () => TFields
}
