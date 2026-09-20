import { immutableArray, immutableRecord } from '@ultimabase/shared'

import type { SchemaDeclarationBatch } from './schema-declaration-contracts.js'
import type { CompiledCommandGraph } from './command-graph.js'
import type { CompiledTypegenGraph } from './typegen-declarations.js'

/** Projects Typegen's inert view from the successfully compiled application graph. */
export const createCompiledTypegenGraph = (options: {
	readonly batches: readonly SchemaDeclarationBatch[]
	readonly commands: CompiledCommandGraph
}): CompiledTypegenGraph =>
	immutableRecord({
		declarations: immutableArray(options.batches.map(({ typegen }) => typegen)),
		operations: immutableArray(
			options.commands.commands.flatMap((command) =>
				command.kind === 'operation'
					? [
							immutableRecord({
								operation: command.definition,
								owner: command.owner,
							}),
						]
					: [],
			),
		),
		options: immutableArray(
			options.batches.flatMap(({ options: definitions }) =>
				definitions.flatMap((option) => {
					const typegen = option.definition.typegen

					return typegen === false
						? []
						: [
								immutableRecord({
									contributionId: option.contributionId,
									...(option.scope === 'field' &&
									'contexts' in option.definition
										? { contexts: option.definition.contexts }
										: {}),
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
		schemaSurfaces: options.commands.schemaSurfaces(),
	})
