import { immutableRecord } from '@ultimabase/shared'

import type {
	CompiledCommandGraph,
	CompiledMutationCommand,
} from '../plugins/command-graph.js'
import {
	queryFromFindManyInput,
	queryFromFindOneInput,
} from '../query/query/input.js'
import type { SchemaDefinition } from '../schema/schema/definition.js'
import type {
	PluginSchemaMutationEnvelope,
	PluginSchemaMutationManyEnvelope,
} from './application-schema-mutations.js'

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

interface PrepareSchemaMutationManyEnvelopeOptions {
	readonly graph: CompiledCommandGraph
	readonly command: CompiledMutationCommand
	readonly schema: SchemaDefinition
	readonly name: string
	readonly where: unknown
	readonly input: unknown
	readonly projection: Readonly<{ include?: unknown; select?: unknown }>
}

/**
 * Normalizes one many-row call (ADR-0316): the `where` of the targeted rows
 * becomes an identifier-only query, and the result projection is checked now
 * so that an invalid selection fails before the transaction starts.
 */
export const prepareSchemaMutationManyEnvelope = ({
	graph,
	command,
	schema,
	name,
	where,
	input,
	projection,
}: PrepareSchemaMutationManyEnvelopeOptions): PluginSchemaMutationManyEnvelope => {
	const payload = graph.snapshotInput(command, input)
	const query = queryFromFindManyInput(schema, {
		select: { id: true },
		where,
	} as never)
	queryFromFindOneInput(schema, {
		...(projection.include === undefined
			? {}
			: { include: projection.include }),
		...(projection.select === undefined ? {} : { select: projection.select }),
	} as never)
	return immutableRecord({
		command: name,
		kind: 'plugin-schema-mutation-many' as const,
		mutation: command.definition,
		payload,
		projection: immutableRecord({
			...(projection.include === undefined
				? {}
				: { include: projection.include }),
			...(projection.select === undefined ? {} : { select: projection.select }),
		}),
		query: query.ast,
	})
}

/** Derives the one-row envelope of one row targeted by a many-row call. */
export const createSchemaMutationRowEnvelope = (
	envelope: PluginSchemaMutationManyEnvelope,
	schema: SchemaDefinition,
	id: string,
): PluginSchemaMutationEnvelope => {
	const query = queryFromFindOneInput(schema, {
		...envelope.projection,
		where: { id: { eq: id } },
	} as never)
	return immutableRecord({
		command: envelope.command,
		id,
		kind: 'plugin-schema-mutation' as const,
		mutation: envelope.mutation,
		payload: envelope.payload,
		query: query.ast,
	})
}
