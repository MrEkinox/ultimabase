import { immutableArray, immutableRecord } from '@ultimabase/shared'

import type { SchemaCompilationProvenance } from '../schema/schema/provenance.js'
import type { SchemaDeclarationBatch } from './schema-declaration-contracts.js'
import type {
	CompiledApplicationSchemaSurface,
	CompiledPluginOperation,
} from './application-surface-registry.js'
import type { CompiledTypegenGraph } from './typegen-declarations.js'

/** Projects Typegen's inert view from the successfully compiled application graph. */
export const createCompiledTypegenGraph = (options: {
	readonly batches: readonly SchemaDeclarationBatch[]
	readonly operations: ReadonlyMap<string, CompiledPluginOperation>
	readonly provenance:
		ReadonlyMap<string, SchemaCompilationProvenance> | undefined
	readonly schemaSurfaces: ReadonlyMap<string, CompiledApplicationSchemaSurface>
}): CompiledTypegenGraph =>
	immutableRecord({
		declarations: immutableArray(options.batches.map(({ typegen }) => typegen)),
		operations: immutableArray([...options.operations.values()]),
		options: immutableArray(
			options.batches.flatMap(({ options: definitions }) =>
				definitions.flatMap((option) => {
					const typegen = option.definition.typegen

					return typegen === false
						? []
						: [
								immutableRecord({
									contributionId: option.contributionId,
									name: option.name,
									owner: option.owner,
									scope: option.scope,
									staticOptions: option.staticOptions,
									typegen,
								}),
							]
				}),
			),
		),
		schemaSurfaces: immutableArray([...options.schemaSurfaces.values()]),
	})
