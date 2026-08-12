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
import type { SchemaCompilerOutput } from './schema-compiler-ir/contracts.js'
import { decodeSchemaCompilerOutput } from './schema-compiler-ir/decoder.js'
import { encodeSchemaCompilerInput } from './schema-compiler-ir/input-encoder.js'
import type { SchemaCompilerImplementation } from './schema-compiler-ir/schema-compiler-capability.js'
import { assertSchemaCompilerOutput } from './schema-compiler-ir/validation.js'

/** Contains every artifact produced by one successful static schema compilation. */
export interface CompiledSchemaDeclarations {
	readonly candidates: readonly PreparedSchemaCompilation[]
	readonly output: SchemaCompilerOutput
	readonly provenance: ReadonlyMap<string, SchemaCompilationProvenance>
	readonly runtimeCompilations: readonly PendingSchemaOptionRuntimeCompilation[]
}

/** Resolves options, executes the selected pure compiler, and detaches its output. */
export const compileSchemaDeclarations = (
	prepared: readonly PreparedSchemaCompilation[],
	batches: readonly SchemaDeclarationBatch[],
	compile: SchemaCompilerImplementation,
): CompiledSchemaDeclarations => {
	const optionDefinitions = collectOptionDefinitions(batches)
	const resolvedFields: ResolvedFieldOptions = new WeakMap()
	const additionsBySchema = new Map<SchemaDefinition, OwnedSchemaAddition>()
	for (const batch of batches) {
		for (const addition of batch.additions) {
			additionsBySchema.set(addition.schema, addition)
		}
	}
	let candidates = prepared.map((candidate) => {
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
	const encoded = encodeSchemaCompilerInput(candidates, batches, {
		definitions: optionDefinitions,
		resolvedFields,
	})
	const output = compile(encoded.input)
	assertSchemaCompilerOutput(encoded.input, output, encoded.session)
	candidates = [...decodeSchemaCompilerOutput(output, encoded.session)]

	return immutableRecord({
		candidates: immutableArray(candidates),
		output,
		provenance: new Map(
			candidates.map((candidate) => [
				candidate.schema.className,
				candidate.definition.provenance,
			]),
		),
		runtimeCompilations: collectRuntimeCompilations(batches, candidates),
	})
}
