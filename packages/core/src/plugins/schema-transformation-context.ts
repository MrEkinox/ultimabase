import { immutableArray, immutableRecord } from '@ultimabase/shared'

import type { GenericField } from '../schema/fields/base/contract.js'
import type { JsonValue } from '../schema/fields/builtins/json.js'
import { areSchemaDeclarationValuesCompatible } from '../schema/schema/definition.js'
import type { PreparedSchemaCompilation } from '../schema/schema/definition.js'
import type { SchemaIndexDefinition } from '../schema/schema/indexes.js'
import type {
	SchemaCompilationProvenance,
	SchemaContributionProvenance,
} from '../schema/schema/provenance.js'
import type {
	OptionDefinitionIndex,
	OwnedSchemaPatch,
	ResolvedFieldOptions,
} from './schema-declaration-contracts.js'
import type { ExistingSchemaContributionTarget } from './schema-patch-contracts.js'
import { sameOwner } from './schema-selectors.js'

/** Carries the immutable input facts shared by every patch-operation handler. */
export interface SchemaTransformationContext {
	readonly candidate: PreparedSchemaCompilation
	readonly definitions: OptionDefinitionIndex
	readonly patch: OwnedSchemaPatch
	readonly resolvedFields: ResolvedFieldOptions
}

/** Keeps one candidate's evolving state private to a single patch application. */
export interface SchemaTransformationState {
	constraints: PreparedSchemaCompilation['definition']['constraints']
	developerFields: PreparedSchemaCompilation['developerFields']
	extensions: PreparedSchemaCompilation['definition']['extensions']
	fields: PreparedSchemaCompilation['definition']['fields']
	indexes: readonly SchemaIndexDefinition[]
	provenance: SchemaCompilationProvenance
	schemaOptionValues: Readonly<Record<string, unknown>>
}

export const assertExactFieldTransformTarget = (
	actual: GenericField,
	provenance: SchemaContributionProvenance | undefined,
	target: ExistingSchemaContributionTarget<GenericField>,
	path: string,
): SchemaContributionProvenance => {
	if (provenance === undefined) {
		throw new TypeError(`Missing schema contribution provenance: ${path}`)
	}
	if (provenance.owner.kind === 'core') {
		throw new TypeError(`Protected Core schema contribution: ${path}`)
	}
	if (!sameOwner(provenance.owner, target.owner)) {
		throw new TypeError(`Stale schema contribution owner: ${path}`)
	}
	if (provenance.contributionId !== target.contributionId) {
		throw new TypeError(`Stale schema contribution identity: ${path}`)
	}
	if (!areSchemaDeclarationValuesCompatible(actual, target.expected)) {
		throw new TypeError(`Stale schema contribution shape: ${path}`)
	}

	return provenance
}

export const assertExactJsonTransformTarget = (
	actual: unknown,
	provenance: SchemaContributionProvenance | undefined,
	target: ExistingSchemaContributionTarget<JsonValue>,
	path: string,
): SchemaContributionProvenance => {
	if (provenance === undefined) {
		throw new TypeError(`Missing schema contribution provenance: ${path}`)
	}
	if (!sameOwner(provenance.owner, target.owner)) {
		throw new TypeError(`Stale schema contribution owner: ${path}`)
	}
	if (provenance.contributionId !== target.contributionId) {
		throw new TypeError(`Stale schema contribution identity: ${path}`)
	}
	if (!areSchemaDeclarationValuesCompatible(actual, target.expected)) {
		throw new TypeError(`Stale schema contribution shape: ${path}`)
	}

	return provenance
}

export const withoutRecordKey = <TValue>(
	record: Readonly<Record<string, TValue>>,
	removedKey: string,
): Readonly<Record<string, TValue>> =>
	immutableRecord(
		Object.fromEntries(
			Object.entries(record).filter(([key]) => key !== removedKey),
		),
	)

export const renameIndexField = (
	fields: readonly [string, ...string[]],
	from: string,
	to: string,
): readonly [string, ...string[]] => {
	const [first, ...remaining] = fields

	return immutableArray([
		first === from ? to : first,
		...remaining.map((name) => (name === from ? to : name)),
	])
}
