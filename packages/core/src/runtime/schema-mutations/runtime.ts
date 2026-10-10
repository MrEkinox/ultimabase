import { immutableRecord } from '@ultimabase/shared'

import type { PluginSchemaMutationEnvelope } from '../../application/application-schema-mutations.js'
import { readApplicationKernelState } from '../../application/application-kernel-state.js'
import { FrameworkError } from '../../errors/framework-error.js'
import { PluginError } from '../../errors/plugin-error.js'
import { PublicError } from '../../errors/public-error.js'
import { runWithApplicationPluginOwner } from '../../plugins/callback-execution.js'
import type { CompiledMutationCommand } from '../../plugins/command-graph.js'
import type { SchemaDefinition } from '../../schema/index.js'
import type { SchemaMutationTransportImplementation } from '../commands/bindings.js'
import type { RequestContext } from '../context/request-context.js'
import { commandFailure } from '../plugin-operations/request-execution.js'
import { getSchemaMutationWireCodec } from './transport-capabilities.js'

const missingHandler = (
	command: CompiledMutationCommand,
): FrameworkError<'PLUGIN_OPERATION_INVALID'> =>
	commandFailure(
		command,
		'schema-mutation-handler-missing',
		`Schema mutation ${command.definition.name} has no installed handler.`,
	)

/** Fails Runtime assembly, not pure compilation, when a selected resolver is missing. */
export const assertSchemaMutationHandlers = (application: object): void => {
	const graph = readApplicationKernelState(application).commands
	for (const command of graph.commands) {
		if (command.kind !== 'mutation' || command.surfaces.length === 0) continue
		if (graph.bindings.handler(command) === undefined) {
			throw missingHandler(command)
		}
	}
}

/** Invokes one exact resolver under its retained plugin attribution. */
export const resolveSchemaMutation = async (
	application: object,
	command: CompiledMutationCommand,
	schema: SchemaDefinition,
	envelope: PluginSchemaMutationEnvelope,
	context: RequestContext,
	originalItem: Readonly<Record<string, unknown>>,
): Promise<unknown> => {
	const owned =
		readApplicationKernelState(application).commands.bindings.handler(command)
	if (owned?.kind !== 'mutation') throw missingHandler(command)
	try {
		const invoke = (): Promise<unknown> =>
			Promise.resolve(
				owned.resolve(
					immutableRecord({
						context,
						input: envelope.payload,
						originalItem,
						target: immutableRecord({ id: envelope.id, schema }),
					}),
				),
			)
		return await runWithApplicationPluginOwner(application, owned.owner, invoke)
	} catch (error: unknown) {
		if (
			(error instanceof PluginError &&
				typeof error.code === 'string' &&
				command.definition.errors.includes(error.code)) ||
			error instanceof FrameworkError ||
			error instanceof PublicError
		) {
			throw error
		}
		throw commandFailure(
			command,
			'schema-mutation-handler-failed',
			`Schema mutation ${command.definition.name} handler failed.`,
			error,
			owned.contributionId,
		)
	}
}

/** Decodes one payload under the exact binding owner's attribution. */
export const decodeSchemaMutationInput = (
	application: object,
	binding: SchemaMutationTransportImplementation,
	value: unknown,
): unknown => {
	const codec = getSchemaMutationWireCodec(binding.binding.codec)
	if (codec === undefined) {
		throw new TypeError('Schema mutation transport codec is unavailable')
	}
	return runWithApplicationPluginOwner(application, binding.owner, () =>
		codec.decode(value),
	)
}
