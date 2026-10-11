import type { SchemaDefinition } from '../../schema/definition.js'
import type { GenericField } from './contract.js'
import { snapshotScalarFieldValue } from './definition.js'

/**
 * What existing rows receive when storage adds a required plugin field to a
 * table that already has rows: a fixed `value`, or why none exists (`missing`,
 * a sentence naming what to declare).
 */
export type PluginFieldExistingRows<TValue = unknown> =
	Readonly<{ value: TValue }> | Readonly<{ missing: string }>

/** Optional plugin field behavior Core and adapters read (ADR-0321). */
interface PluginFieldMetadata {
	readonly snapshotUpdateInput?: (value: unknown, path: string) => unknown
	readonly existingRows?: (schema: SchemaDefinition) => PluginFieldExistingRows
	readonly storageDefault?: Readonly<{ value: unknown }>
}

// Weak ownership keeps callbacks out of the inert field metadata.
const metadataByField = new WeakMap<object, PluginFieldMetadata>()

/** @internal Attaches the optional metadata of one plugin field. */
export const bindPluginFieldMetadata = (
	field: GenericField,
	metadata: PluginFieldMetadata,
): void => {
	metadataByField.set(field, metadata)
}

/**
 * Snapshots one update `set` value: the field's extra update input when it
 * declares one, else its ordinary value.
 */
export const snapshotUpdateInputFieldValue = (
	field: GenericField,
	value: unknown,
	path: string,
): unknown => {
	const snapshotUpdateInput = metadataByField.get(field)?.snapshotUpdateInput
	return snapshotUpdateInput === undefined
		? snapshotScalarFieldValue(field, value, path)
		: snapshotUpdateInput(value, path)
}

/** Reports whether one field accepts an extra update input. */
export const hasFieldUpdateInput = (field: GenericField): boolean =>
	metadataByField.get(field)?.snapshotUpdateInput !== undefined

/**
 * Reads what existing rows of `schema` receive when storage adds this plugin
 * field to a table with rows; `undefined` when the field declares nothing.
 */
export const readPluginFieldExistingRows = (
	field: GenericField,
	schema: SchemaDefinition,
): PluginFieldExistingRows | undefined =>
	metadataByField.get(field)?.existingRows?.(schema)

/** Reads the storage default of one plugin field, if it declares one. */
export const readPluginFieldStorageDefault = (
	field: GenericField,
): Readonly<{ value: unknown }> | undefined =>
	metadataByField.get(field)?.storageDefault
