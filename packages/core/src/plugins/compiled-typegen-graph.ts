import { immutableArray, immutableRecord } from '@ultimabase/shared'

import type { SchemaCompilationProvenance } from '../schema/schema/provenance.js'
import type { SchemaDeclarationBatch } from './schema-declaration-contracts.js'
import type {
	CompiledApplicationSchemaSurface,
	CompiledPluginOperation,
} from './application-surface-registry.js'
import type { CompiledTypegenGraph } from './typegen-declarations.js'

const optionKey = (
	contributionId: string,
	owner: Readonly<{ readonly instanceId?: string; readonly pluginId: string }>,
): string =>
	`${owner.pluginId}\u0000${owner.instanceId ?? ''}\u0000${contributionId}`

const collectUsedOptionDefinitions = (
	compiledProvenance:
		ReadonlyMap<string, SchemaCompilationProvenance> | undefined,
): ReadonlySet<string> => {
	const used = new Set<string>()
	for (const provenance of compiledProvenance?.values() ?? []) {
		const occurrences = [
			...Object.values(provenance.options),
			...Object.values(provenance.fieldOptions).flatMap((options) =>
				Object.values(options),
			),
		]
		for (const occurrence of occurrences) {
			if (occurrence.definition.owner.kind === 'plugin') {
				used.add(
					optionKey(
						occurrence.definition.contributionId,
						occurrence.definition.owner,
					),
				)
			}
		}
	}
	return used
}

/** Projects Typegen's inert view from the successfully compiled application graph. */
export const createCompiledTypegenGraph = (options: {
	readonly batches: readonly SchemaDeclarationBatch[]
	readonly operations: ReadonlyMap<string, CompiledPluginOperation>
	readonly provenance:
		ReadonlyMap<string, SchemaCompilationProvenance> | undefined
	readonly schemaSurfaces: ReadonlyMap<string, CompiledApplicationSchemaSurface>
}): CompiledTypegenGraph => {
	const usedOptionDefinitions = collectUsedOptionDefinitions(options.provenance)
	return immutableRecord({
		declarations: immutableArray(options.batches.map(({ typegen }) => typegen)),
		operations: immutableArray([...options.operations.values()]),
		options: immutableArray(
			options.batches.flatMap(({ options: definitions }) =>
				definitions
					.map((option) =>
						immutableRecord({
							contributionId: option.contributionId,
							name: option.name,
							owner: option.owner,
							scope: option.scope,
							staticOptions: option.staticOptions,
							typegen: option.definition.typegen,
						}),
					)
					.filter((option) =>
						usedOptionDefinitions.has(
							optionKey(option.contributionId, option.owner),
						),
					),
			),
		),
		schemaSurfaces: immutableArray([...options.schemaSurfaces.values()]),
	})
}
