import type { JsonValue } from '../schema/fields/builtins/json.js'

import type { GenericField } from '../schema/fields/base/contract.js'

import type {
	SchemaIndexDefinition,
	SchemaIndexOptions,
} from '../schema/schema/indexes.js'

import { type SchemaConstraintDefinition } from '../schema/schema/constraints.js'

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

export interface SchemaSelection {
	readonly selectionId: string
	readonly selector: SchemaSelectorOptions
}

export const schemaSelections: WeakSet<object> = new WeakSet<object>()

export interface AddSchemaFieldOperation {
	readonly contributionId: string
	readonly field: GenericField
	readonly kind: 'field:add'
	readonly name: string
}

/** Configures one plugin-contributed field before it enters the schema graph. */
export interface AddSchemaFieldOptions extends Omit<
	AddSchemaFieldOperation,
	'kind'
> {
	/** Keeps the stored field selectable while rejecting every caller mutation input. */
	readonly mutationInput?: 'forbidden'
}

export interface AddSchemaIndexOperation {
	readonly contributionId: string
	readonly index: SchemaIndexOptions
	readonly kind: 'index:add'
}

export interface ExistingSchemaContributionTarget<TExpected> {
	readonly contributionId: string
	readonly expected: TExpected
	readonly owner: SchemaContributionOwnerReference
}

export interface ReplaceSchemaFieldOperation {
	readonly contributionId: string
	readonly field: GenericField
	readonly kind: 'field:replace'
	readonly name: string
	readonly target: ExistingSchemaContributionTarget<GenericField>
}

export interface RenameSchemaFieldOperation {
	readonly contributionId: string
	readonly from: string
	readonly kind: 'field:rename'
	readonly target: ExistingSchemaContributionTarget<GenericField>
	readonly to: string
}

export interface RemoveSchemaFieldOperation {
	readonly contributionId: string
	readonly kind: 'field:remove'
	readonly name: string
	readonly target: ExistingSchemaContributionTarget<GenericField>
}

export interface SetSchemaOptionOperation {
	readonly contributionId: string
	readonly kind: 'schema-option:set'
	readonly name: string
	readonly target?: ExistingSchemaContributionTarget<JsonValue>
	readonly value: unknown
}

export interface RemoveSchemaOptionOperation {
	readonly contributionId: string
	readonly kind: 'schema-option:remove'
	readonly name: string
	readonly target: ExistingSchemaContributionTarget<JsonValue>
}

export interface SetSchemaFieldOptionOperation {
	readonly contributionId: string
	readonly field: string
	readonly kind: 'field-option:set'
	readonly name: string
	readonly target?: ExistingSchemaContributionTarget<JsonValue>
	readonly value: unknown
}

export interface RemoveSchemaFieldOptionOperation {
	readonly contributionId: string
	readonly field: string
	readonly kind: 'field-option:remove'
	readonly name: string
	readonly target: ExistingSchemaContributionTarget<JsonValue>
}

export interface ReplaceSchemaIndexOperation {
	readonly contributionId: string
	readonly index: SchemaIndexOptions
	readonly kind: 'index:replace'
	readonly target: ExistingSchemaContributionTarget<SchemaIndexDefinition>
}

export interface RemoveSchemaIndexOperation {
	readonly contributionId: string
	readonly kind: 'index:remove'
	readonly target: ExistingSchemaContributionTarget<SchemaIndexDefinition>
}

export interface AddSchemaConstraintOperation {
	readonly constraint: SchemaConstraintDefinition
	readonly contributionId: string
	readonly kind: 'constraint:add'
}

export interface ReplaceSchemaConstraintOperation {
	readonly constraint: SchemaConstraintDefinition
	readonly contributionId: string
	readonly kind: 'constraint:replace'
	readonly target: ExistingSchemaContributionTarget<SchemaConstraintDefinition>
}

export interface RemoveSchemaConstraintOperation {
	readonly contributionId: string
	readonly kind: 'constraint:remove'
	readonly target: ExistingSchemaContributionTarget<SchemaConstraintDefinition>
}

export type SchemaPatchOperation =
	| AddSchemaConstraintOperation
	| AddSchemaFieldOperation
	| AddSchemaIndexOperation
	| RemoveSchemaFieldOptionOperation
	| RemoveSchemaConstraintOperation
	| RemoveSchemaFieldOperation
	| RemoveSchemaIndexOperation
	| RemoveSchemaOptionOperation
	| RenameSchemaFieldOperation
	| ReplaceSchemaFieldOperation
	| ReplaceSchemaConstraintOperation
	| ReplaceSchemaIndexOperation
	| SetSchemaFieldOptionOperation
	| SetSchemaOptionOperation

export const schemaPatchOperations: WeakSet<object> = new WeakSet<object>()
