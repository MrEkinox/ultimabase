import type { JsonValue } from '../schema/fields/builtins/json.js'

import type { GenericField } from '../schema/fields/base/contract.js'

import type { SchemaIndexOptions } from '../schema/schema/indexes.js'

import { type SchemaContributionOwnerReference } from '../schema/schema/provenance.js'

/** Selects schemas where one normalized direct option is present. */
export interface SchemaOptionPresenceSelector {
	/** Exact direct option name; its value is never read by this selector. */
	readonly name: string
	readonly equals?: never
	readonly path?: never
	readonly present?: never
}

/** Selects schemas where one direct option value equals portable JSON. */
export interface SchemaOptionEqualitySelector {
	/** Portable value compared with structural JSON equality. */
	readonly equals: JsonValue
	/** Exact direct option name. */
	readonly name: string
	/** Optional path into the normalized portable option value. */
	readonly path?: readonly string[]
	readonly present?: never
}

/** Selects schemas where one normalized direct option is absent. */
export interface SchemaOptionAbsenceSelector {
	readonly equals?: never
	/** Exact direct option name; the definition must still resolve uniquely. */
	readonly name: string
	readonly path?: never
	/** Absence is the only supported negated selector operation. */
	readonly present: false
}

/** Chooses presence, absence, or structural JSON equality explicitly. */
export type SchemaOptionSelector =
	| SchemaOptionAbsenceSelector
	| SchemaOptionEqualitySelector
	| SchemaOptionPresenceSelector

/** Selects schemas from the graph frozen before the current plugin's patches. */
export interface SchemaSelectorOptions {
	readonly className?: string
	readonly field?: Readonly<{ readonly kind?: string; readonly name: string }>
	readonly option?: SchemaOptionSelector
	readonly owner?: SchemaContributionOwnerReference
}

export interface SchemaSelection<
	TSelector extends SchemaSelectorOptions = SchemaSelectorOptions,
> {
	readonly selectionId: string
	readonly selector: TSelector
}

export const schemaSelections: WeakSet<object> = new WeakSet<object>()

export interface AddSchemaFieldOperation<
	TName extends string = string,
	TField extends GenericField = GenericField,
> {
	readonly contributionId: string
	readonly field: TField
	readonly kind: 'field:add'
	readonly name: TName
}

/** Configures one plugin-contributed field before it enters the schema graph. */
export interface AddSchemaFieldOptions<
	TName extends string = string,
	TField extends GenericField = GenericField,
> extends Omit<AddSchemaFieldOperation<TName, TField>, 'kind'> {
	/** Keeps the stored field selectable while rejecting every caller mutation input. */
	readonly mutationInput?: 'forbidden'
}

export interface AddSchemaIndexOperation {
	readonly contributionId: string
	readonly index: SchemaIndexOptions
	readonly kind: 'index:add'
}

export interface SetSchemaOptionOperation {
	readonly contributionId: string
	readonly kind: 'schema-option:set'
	readonly name: string
	readonly value: unknown
}

export interface SetSchemaFieldOptionOperation {
	readonly contributionId: string
	readonly field: string
	readonly kind: 'field-option:set'
	readonly name: string
	readonly value: unknown
}

export type SchemaPatchOperation =
	| AddSchemaFieldOperation
	| AddSchemaIndexOperation
	| SetSchemaFieldOptionOperation
	| SetSchemaOptionOperation

export const schemaPatchOperations: WeakSet<object> = new WeakSet<object>()
