import { immutableArray, immutableRecord } from '@ultimabase/shared'

import type {
	PreparedSchemaCompilation,
	SchemaDefinition,
} from '../schema/schema/definition.js'
import type { SchemaCompilationProvenance } from '../schema/schema/provenance.js'
import {
	attachPluginDeclarationDiagnostic,
	type OwnedSchemaAddition,
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
	const optionDefinitions = collectOptionDefinitions(batches)
	const resolvedFields: ResolvedFieldOptions = new WeakMap()
	const additionsBySchema = new Map<SchemaDefinition, OwnedSchemaAddition>()
	for (const batch of batches) {
		for (const addition of batch.additions) {
			additionsBySchema.set(addition.schema, addition)
		}
	}
	const initial = prepared.map((candidate) => {
		const addition = additionsBySchema.get(candidate.schema)
		try {
			const resolved = resolveCandidateOptions(
				candidate,
				optionDefinitions,
				resolvedFields,
				addition?.owner,
			)
			return attachInitialContributionProvenance(
				resolved,
				addition,
				optionDefinitions,
			)
		} catch (cause: unknown) {
			if (addition === undefined) throw cause
			throw attachPluginDeclarationDiagnostic(
				cause,
				addition.owner,
				candidate.schema.className,
				addition.contributionId,
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
