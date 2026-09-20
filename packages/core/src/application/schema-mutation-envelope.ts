import { immutableRecord } from '@ultimabase/shared'

import type {
	CompiledCommandGraph,
	CompiledMutationCommand,
} from '../plugins/command-graph.js'
import { queryFromFindOneInput } from '../query/query/input.js'
import type { SchemaDefinition } from '../schema/schema/definition.js'
import type { PluginSchemaMutationEnvelope } from './application-schema-mutations.js'

interface PrepareSchemaMutationEnvelopeOptions {
	readonly graph: CompiledCommandGraph
	readonly command: CompiledMutationCommand
	readonly schema: SchemaDefinition
	readonly name: string
	readonly id: string
	readonly input: unknown
	readonly projection: Readonly<{ include?: unknown; select?: unknown }>
}

/** Handles and transports validate the payload before reading result projection options. */
export const prepareSchemaMutationEnvelope = ({
	graph,
	command,
	schema,
	name,
	id,
	input,
	projection,
}: PrepareSchemaMutationEnvelopeOptions): PluginSchemaMutationEnvelope => {
	const payload = graph.snapshotInput(command, input)
	const query = queryFromFindOneInput(schema, {
		...(projection.include === undefined
			? {}
			: { include: projection.include }),
		...(projection.select === undefined ? {} : { select: projection.select }),
		where: { id: { eq: id } },
	} as never)
	return immutableRecord({
		command: name,
		id,
		kind: 'plugin-schema-mutation' as const,
		mutation: command.definition,
		payload,
		query: query.ast,
	})
}
