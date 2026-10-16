import { immutableArray, immutableRecord } from '@ultimabase/shared'

import type {
	PreparedSchemaCompilation,
	SchemaDefinition,
} from '../schema/schema/definition.js'
import type { SchemaCompilationProvenance } from '../schema/schema/provenance.js'
import {
	attachPluginDeclarationDiagnostic,
	type OwnedSchemaAddition,
	type OwnedSchemaClaim,
	type OwnedSchemaSource,
	type PendingSchemaOptionRuntimeCompilation,
	type ResolvedFieldOptions,
	type SchemaDeclarationBatch,
} from './schema-declaration-contracts.js'
import { attachInitialContributionProvenance } from './schema-declaration-provenance.js'
import { resolveCandidateOptions } from './schema-option-resolution.js'
import {
	collectOptionDefinitions,
	collectRuntimeCompilations,
} from './schema-runtime-options.js'
import type { CompiledSchemaSelection } from './schema-compilation/contracts.js'
import { compileCanonicalSchemas } from './schema-compilation/compiler.js'
import {
	prepareSchemaBatches,
	snapshotPreparedSchema,
} from './schema-compilation/preparation.js'
import { SchemaCompilationValues } from './schema-compilation/values.js'
import { assertSchemaCompilationResult } from './schema-compilation/validation.js'
import { assertCompiledSchemaIndexes } from '../schema/schema/indexes.js'
import { assertDeclaredRulesComplete } from '../schema/schema/definition-compilation.js'

/** Contains every artifact produced by one successful static schema compilation. */
export interface CompiledSchemaDeclarations {
	readonly candidates: readonly PreparedSchemaCompilation[]
	readonly selections: readonly CompiledSchemaSelection[]
	readonly provenance: ReadonlyMap<string, SchemaCompilationProvenance>
	readonly runtimeCompilations: readonly PendingSchemaOptionRuntimeCompilation[]
}

/** Resolves options, executes the Core compiler, and detaches its output. */
export const compileSchemaDeclarations = (
	prepared: readonly PreparedSchemaCompilation[],
	batches: readonly SchemaDeclarationBatch[],
): CompiledSchemaDeclarations => {
	// Features set in `define` whose required rules no `.with` gave (ADR-0339).
	for (const { schema } of prepared) assertDeclaredRulesComplete(schema)
	const optionDefinitions = collectOptionDefinitions(batches)
	const resolvedFields: ResolvedFieldOptions = new WeakMap()
	const additionsBySchema = new Map<SchemaDefinition, OwnedSchemaAddition>()
	const claimsBySchema = new Map<SchemaDefinition, OwnedSchemaClaim>()
	for (const batch of batches) {
		for (const addition of batch.additions) {
			additionsBySchema.set(addition.schema, addition)
		}
		for (const claim of batch.claims) {
			const existing = claimsBySchema.get(claim.schema)
			if (existing !== undefined) {
				throw attachPluginDeclarationDiagnostic(
					new TypeError(
						`Schema is already claimed by ${existing.owner.pluginId}: ${claim.schema.className}`,
					),
					claim.owner,
					claim.schema.className,
					claim.contributionId,
				)
			}
			claimsBySchema.set(claim.schema, claim)
		}
	}
	for (const claim of claimsBySchema.values()) {
		if (
			additionsBySchema.has(claim.schema) ||
			!prepared.some((candidate) => candidate.schema === claim.schema)
		) {
			throw attachPluginDeclarationDiagnostic(
				new TypeError(
					`Claimed schema must be registered in application schemas: ${claim.schema.className}`,
				),
				claim.owner,
				claim.schema.className,
				claim.contributionId,
			)
		}
	}
	const initial = prepared.map((candidate) => {
		const addition = additionsBySchema.get(candidate.schema)
		const source: OwnedSchemaSource | undefined =
			addition ?? claimsBySchema.get(candidate.schema)
		try {
			const resolved = resolveCandidateOptions(
				candidate,
				optionDefinitions,
				resolvedFields,
				source?.owner,
			)
			return attachInitialContributionProvenance(
				resolved,
				source,
				optionDefinitions,
			)
		} catch (cause: unknown) {
			if (source === undefined) throw cause
			throw attachPluginDeclarationDiagnostic(
				cause,
				source.owner,
				candidate.schema.className,
				source.contributionId,
			)
		}
	})
	const values = new SchemaCompilationValues()
	const candidates = immutableArray(
		initial.map((candidate) => snapshotPreparedSchema(candidate, values)),
	)
	const declarations = prepareSchemaBatches(
		candidates,
		batches,
		optionDefinitions,
		resolvedFields,
		values,
	)
	const output = compileCanonicalSchemas(
		candidates,
		declarations,
		optionDefinitions,
		values,
	)
	assertSchemaCompilationResult(candidates, declarations, output, values)
	for (const { definition } of output.candidates) {
		assertCompiledSchemaIndexes(
			definition.className,
			definition.indexes,
			definition.persistedFields,
		)
	}

	return immutableRecord({
		candidates: output.candidates,
		selections: output.selections,
		provenance: new Map(
			output.candidates.map((candidate) => [
				candidate.schema.className,
				candidate.definition.provenance,
			]),
		),
		runtimeCompilations: collectRuntimeCompilations(batches, output.candidates),
	})
}
