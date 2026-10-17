import { readApplicationKernelState } from '../../application/application-kernel-state.js'
import {
	assertApplicationExecution,
	runApplicationWork,
} from '../../application/active-application.js'
import type {
	PluginSchemaMutationEnvelope,
	PluginSchemaMutationManyEnvelope,
} from '../../application/application-schema-mutations.js'
import { createSchemaMutationRowEnvelope } from '../../application/schema-mutation-envelope.js'
import { FrameworkError } from '../../errors/framework-error.js'
import type { CompiledMutationCommand } from '../../plugins/command-graph.js'
import {
	normalizeOperationOptions,
	type NormalizedOperationOptions,
} from '../../query/operations/execution.js'
import type { SchemaDefinition } from '../../schema/index.js'
import { runWithRequestEngineScope } from '../context/active-framework-context.js'
import {
	readFrameworkMasterAuthority,
	type RequestEngine,
} from '../engine/framework-engine.js'
import {
	readRequestEngineInternals,
	type RequestEngineInternals,
} from '../engine/request-engine.js'
import { resolveTerminalContext } from '../engine/application-binding.js'
import { materializeOperationResult } from '../operations/materialize-result.js'
import {
	executeRuntimeSchemaMutation,
	executeRuntimeSchemaMutationRows,
} from './pipeline-execution.js'
import { resolveRuntimeSchemaMutationTargets } from './target-resolution.js'

type SchemaMutationRequestEnvelope =
	PluginSchemaMutationEnvelope | PluginSchemaMutationManyEnvelope

const assertEnvelope = (
	application: RequestEngineInternals['application'],
	command: CompiledMutationCommand,
	schema: SchemaDefinition,
	envelope: SchemaMutationRequestEnvelope,
): void => {
	const envelopeKind: unknown = envelope.kind
	const many = command.definition.target === 'many'
	if (
		!application.ownsSchema(schema) ||
		readApplicationKernelState(application).commands.get(
			command.definition.name,
		) !== command ||
		!command.surfaces.some(
			(surface) =>
				surface.className === schema.className &&
				surface.name === envelope.command,
		) ||
		envelopeKind !==
			(many ? 'plugin-schema-mutation-many' : 'plugin-schema-mutation') ||
		envelope.mutation !== command.definition ||
		('id' in envelope && envelope.id.length === 0) ||
		envelope.query.schema.definition !== schema
	) {
		throw new FrameworkError(
			'PLUGIN_OPERATION_INVALID',
			'Schema mutation envelope does not match the installed declaration.',
			{
				publicMessage: 'The requested operation is not available.',
				internalDetails: { kind: 'schema-mutation-envelope-mismatch' },
			},
		)
	}
}

/** Resolves authority, transaction scope, and the logical Runtime entry point. */
const executeSchemaMutationRequest = async (
	engine: RequestEngine,
	command: CompiledMutationCommand,
	schema: SchemaDefinition,
	envelope: SchemaMutationRequestEnvelope,
	options: NormalizedOperationOptions,
): Promise<unknown> => {
	const {
		application,
		automaticTransaction,
		derive,
		framework,
		lifetime,
		pipeline,
	} = readRequestEngineInternals(engine)
	assertApplicationExecution(application)
	assertEnvelope(application, command, schema, envelope)
	const context = await resolveTerminalContext(
		application,
		readFrameworkMasterAuthority(framework),
		engine.context,
		options,
		() =>
			`Schema mutation ${command.definition.name} on schema ${schema.className}`,
	)
	// A derived authority or the automatic transaction re-enters this boundary.
	const reenter = (target: RequestEngine) =>
		executeRequestSchemaMutation(
			target,
			command,
			schema,
			envelope,
			normalizeOperationOptions(undefined),
		)
	if (context !== engine.context) return reenter(derive(context))
	if (
		command.definition.authority === 'master' &&
		context.access.mode !== 'master'
	) {
		throw new FrameworkError(
			'MASTER_ACCESS_DENIED',
			`Schema mutation ${command.definition.name} requires Master authority.`,
			{ publicMessage: 'Master access is required.' },
		)
	}
	if (lifetime === undefined) {
		return automaticTransaction(
			{ operation: command.definition.name, schema: schema.className },
			reenter,
		)
	}

	if (envelope.kind === 'plugin-schema-mutation-many') {
		// Every matching row runs the one-row pipeline in this one transaction,
		// so a refused row rolls the whole command back (ADR-0316).
		const executions = await lifetime.run(() =>
			runWithRequestEngineScope(engine, async () => {
				const ids = await resolveRuntimeSchemaMutationTargets(pipeline, {
					command,
					context,
					envelope,
					schema,
				})
				return executeRuntimeSchemaMutationRows(pipeline, {
					application,
					command,
					context,
					envelopes: ids.map((id) =>
						createSchemaMutationRowEnvelope(envelope, schema, id),
					),
					schema,
				})
			}),
		)
		return executions.map((execution) =>
			materializeOperationResult(
				execution.operation as never,
				execution.result as never,
			),
		)
	}
	const execution = await lifetime.run(() =>
		runWithRequestEngineScope(engine, () =>
			executeRuntimeSchemaMutation(pipeline, {
				application,
				command,
				context,
				envelope,
				schema,
			}),
		),
	)
	return materializeOperationResult(
		execution.operation as never,
		execution.result as never,
	)
}

/** Enters the private bridge without adding schema mutations to RequestEngine's API. */
export const executeRequestSchemaMutation = (
	engine: RequestEngine,
	command: CompiledMutationCommand,
	schema: SchemaDefinition,
	envelope: SchemaMutationRequestEnvelope,
	options: NormalizedOperationOptions,
): Promise<unknown> =>
	runApplicationWork(readRequestEngineInternals(engine).application, () =>
		executeSchemaMutationRequest(engine, command, schema, envelope, options),
	)
