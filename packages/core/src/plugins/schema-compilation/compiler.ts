import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import { areSchemaDeclarationValuesCompatible } from '../../schema/schema/declaration-compatibility.js'
import type { PreparedSchemaCompilation } from '../../schema/schema/definition.js'
import { attachPluginDeclarationDiagnostic } from '../schema-declaration-contracts.js'
import type { OptionDefinitionIndex } from '../schema-declaration-contracts.js'
import type { SchemaSelectorOptions } from '../schema-patch-contracts.js'
import { sameOwner } from '../schema-selectors.js'
import type {
	CompiledSchemaSelection,
	PreparedSchemaBatch,
	SchemaCompilationResult,
} from './contracts.js'
import { applySchemaPatchOperation } from './patches.js'
import type { SchemaCompilationValues } from './values.js'

const matches = (
	candidate: PreparedSchemaCompilation,
	selector: SchemaSelectorOptions,
	values: SchemaCompilationValues,
): boolean => {
	const { definition } = candidate
	if (
		selector.className !== undefined &&
		definition.className !== selector.className
	)
		return false
	if (
		selector.owner !== undefined &&
		!sameOwner(definition.provenance.schema.owner, selector.owner)
	)
		return false
	if (selector.field !== undefined) {
		const field = Object.hasOwn(definition.persistedFields, selector.field.name)
			? definition.persistedFields[selector.field.name]
			: undefined
		if (
			field === undefined ||
			(selector.field.kind !== undefined && field.kind !== selector.field.kind)
		)
			return false
	}
	const option = selector.option
	if (option === undefined) return true
	const entry = Object.entries(definition).find(
		([name]) => name === option.name,
	)
	if (option.present === false) return entry === undefined
	if (entry === undefined) return false
	if (option.equals === undefined) return true
	let selected = values.selectionValue(entry[1])
	// Opaque values support presence only, never their contents or old artifact markers.
	if (selected === undefined) return false
	for (const segment of option.path ?? []) {
		if (!isPlainRecord(selected) || !Object.hasOwn(selected, segment))
			return false
		selected = selected[segment]
	}
	return areSchemaDeclarationValuesCompatible(selected, option.equals)
}

/** Compiles private immutable candidates; each batch observes only preceding batches. */
export const compileCanonicalSchemas = (
	candidates: readonly PreparedSchemaCompilation[],
	batches: readonly PreparedSchemaBatch[],
	definitions: OptionDefinitionIndex,
	values: SchemaCompilationValues,
): SchemaCompilationResult => {
	const added = new Set(
		batches.flatMap((batch) =>
			batch.additions.map((candidate) => candidate.schema),
		),
	)
	const states = candidates
		.filter((candidate) => !added.has(candidate.schema))
		.map((candidate) => ({ candidate }))
	const classNames = new Set(
		states.map(({ candidate }) => candidate.schema.className),
	)
	const selections: CompiledSchemaSelection[] = []
	for (const batch of batches) {
		const targets = new Map<string, readonly (typeof states)[number][]>()
		for (const selection of batch.selections) {
			const selected = immutableArray(
				states.filter(({ candidate }) => {
					try {
						return matches(candidate, selection.selector, values)
					} catch (cause: unknown) {
						throw attachPluginDeclarationDiagnostic(
							cause,
							batch.owner,
							candidate.schema.className,
						)
					}
				}),
			)
			targets.set(selection.selectionId, selected)
			selections.push(
				immutableRecord({
					selectionId: selection.selectionId,
					classNames: immutableArray(
						selected.map(({ candidate }) => candidate.schema.className),
					),
				}),
			)
		}
		for (const candidate of batch.additions) {
			if (classNames.has(candidate.schema.className))
				throw new TypeError(
					`Duplicate schema class name: ${candidate.schema.className}`,
				)
			classNames.add(candidate.schema.className)
			states.push({ candidate })
		}
		for (const patch of batch.patches) {
			for (const state of targets.get(patch.targets.selectionId) ?? []) {
				for (const operation of patch.operations) {
					try {
						state.candidate = applySchemaPatchOperation(
							state.candidate,
							patch,
							operation,
							definitions,
							values,
						)
					} catch (cause: unknown) {
						throw attachPluginDeclarationDiagnostic(
							cause,
							patch.owner,
							state.candidate.schema.className,
							operation.contributionId,
						)
					}
				}
			}
		}
	}
	return immutableRecord({
		candidates: immutableArray(states.map(({ candidate }) => candidate)),
		selections: immutableArray(selections),
	})
}
