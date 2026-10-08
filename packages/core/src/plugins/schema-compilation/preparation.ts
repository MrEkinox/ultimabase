import { immutableArray, immutableRecord } from '@ultimabase/shared'

import type {
	PreparedSchemaCompilation,
	SchemaDefinition,
} from '../../schema/schema/definition.js'
import { snapshotJsonValue } from '../../schema/fields/builtins/json.js'
import type {
	OptionDefinitionIndex,
	OwnedSchemaPatch,
	ResolvedFieldOptions,
	SchemaDeclarationBatch,
} from '../schema-declaration-contracts.js'
import { resolveOptionDefinition } from '../schema-declaration-contracts.js'
import type { SchemaPatchOperation } from '../schema-patch-contracts.js'
import { coreSchemaKeys } from '../../schema/schema/registry.js'
import {
	normalizeOwnedOptionValue,
	resolveFieldOptions,
} from '../schema-option-resolution.js'
import type { PreparedSchemaBatch } from './contracts.js'
import { assertFrozenPortable, type SchemaCompilationValues } from './values.js'

/** Keeps portable option snapshots and nominal field identity from the former round trip. */
export const snapshotPreparedSchema = (
	candidate: PreparedSchemaCompilation,
	values: SchemaCompilationValues,
): PreparedSchemaCompilation => {
	const persistedFields = immutableRecord(
		Object.fromEntries(
			Object.entries(candidate.definition.persistedFields).map(
				([name, field]) => [
					name,
					values.field(field, `${candidate.schema.className}.fields.${name}`),
				],
			),
		),
	) as PreparedSchemaCompilation['definition']['persistedFields']
	const fields = immutableRecord({
		...persistedFields,
		...candidate.definition.virtualFields,
	})
	const options = Object.fromEntries(
		Object.entries(candidate.definition)
			.filter(([name]) => !coreSchemaKeys.has(name))
			.map(([name, value]) => [
				name,
				values.snapshot(value, `${candidate.schema.className}.options.${name}`),
			]),
	)
	return immutableRecord({
		schema: candidate.schema,
		developerFields: immutableRecord(
			Object.fromEntries(
				Object.keys(candidate.developerFields).map((name) => {
					const field = fields[name]
					if (field === undefined)
						throw new TypeError(
							`Missing developer field in compiler output: ${candidate.schema.className}.${name}`,
						)
					return [name, field]
				}),
			),
		),
		definition: immutableRecord({
			...candidate.definition,
			...options,
			fields,
			persistedFields,
		}),
	})
}

const prepareOperation = (
	operation: SchemaPatchOperation,
	patch: OwnedSchemaPatch,
	path: string,
	definitions: OptionDefinitionIndex,
	resolvedFields: ResolvedFieldOptions,
	values: SchemaCompilationValues,
): SchemaPatchOperation => {
	const operationPath = `${path}.${operation.contributionId}`
	switch (operation.kind) {
		case 'field:add':
			return immutableRecord({
				...operation,
				field: values.field(
					resolveFieldOptions(
						operation.field,
						definitions.field,
						`${operationPath}.field`,
						resolvedFields,
						'stored',
						patch.owner,
					),
					`${operationPath}.field`,
				),
			})
		case 'index:add':
			// Validate unused declarations too; an empty selection cannot hide executable data.
			assertFrozenPortable(operation.index, `${operationPath}.index`)
			return immutableRecord({
				...operation,
				index: immutableRecord({
					fields: immutableArray(operation.index.fields),
					unique: operation.index.unique ?? false,
				}),
			})
		case 'schema-option:set':
		case 'field-option:set': {
			const scope = operation.kind === 'schema-option:set' ? 'schema' : 'field'
			const definition = resolveOptionDefinition(
				definitions[scope],
				operation.name,
				`${operationPath}.value`,
				patch.owner,
			)
			if (definition === undefined)
				throw new TypeError(`Unknown ${scope} option: ${operation.name}`)
			if (
				scope === 'field' &&
				(!('contexts' in definition.definition) ||
					!definition.definition.contexts.includes('stored'))
			)
				throw new TypeError(
					`Field option "${operation.name}" from ${definition.owner.pluginId} does not support the stored context`,
				)
			return immutableRecord({
				...operation,
				value: snapshotJsonValue(
					normalizeOwnedOptionValue(
						definition,
						operation.value,
						`${operationPath}.value`,
					),
					`${operationPath}.value`,
				),
			})
		}
	}
}

/** Normalize every declaration before applying patches, even when no target matches. */
export const prepareSchemaBatches = (
	candidates: readonly PreparedSchemaCompilation[],
	batches: readonly SchemaDeclarationBatch[],
	definitions: OptionDefinitionIndex,
	resolvedFields: ResolvedFieldOptions,
	values: SchemaCompilationValues,
): readonly PreparedSchemaBatch[] => {
	const schemas = new Map<SchemaDefinition, PreparedSchemaCompilation>(
		candidates.map((candidate) => [candidate.schema, candidate]),
	)
	return immutableArray(
		batches.map((batch, order) => {
			const selections = new Map(
				[
					...batch.patches.map(({ targets }) => targets),
					...batch.surfaces.modelSurfaces.flatMap(({ target }) =>
						target.kind === 'selection' ? [target.selection] : [],
					),
				].map((selection) => [selection.selectionId, selection]),
			)
			for (const selection of selections.values()) {
				const option = selection.selector.option
				if (
					option !== undefined &&
					resolveOptionDefinition(
						definitions.schema,
						option.name,
						`schema selector option.${option.name}`,
						batch.owner,
					) === undefined
				)
					throw new TypeError(`Unknown schema selector option: ${option.name}`)
			}
			return immutableRecord({
				owner: batch.owner,
				additions: immutableArray(
					batch.additions.map(({ schema }) => {
						const candidate = schemas.get(schema)
						if (candidate === undefined)
							throw new TypeError(
								`Missing prepared schema addition: ${schema.className}`,
							)
						return candidate
					}),
				),
				selections: immutableArray([...selections.values()]),
				patches: immutableArray(
					batch.patches.map((patch, index) =>
						immutableRecord({
							...patch,
							operations: immutableArray(
								patch.operations.map((operation) =>
									prepareOperation(
										operation,
										patch,
										`declarations.${String(order)}.patches.${String(index)}`,
										definitions,
										resolvedFields,
										values,
									),
								),
							),
						}),
					),
				),
			})
		}),
	)
}
