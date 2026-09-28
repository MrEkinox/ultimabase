import { immutableRecord } from '@ultimabase/shared'

import type { PluginSchemaMutationEnvelope } from '../../application/application-schema-mutations.js'
import { FrameworkError } from '../../errors/framework-error.js'
import { PluginError } from '../../errors/plugin-error.js'
import type { FrameworkApplication } from '../../application/framework-application.js'
import type { PluginDefinition } from '../../foundation.js'
import { readApplicationKernelState } from '../../application/application-kernel-state.js'
import type { CommandBindings } from '../commands/bindings.js'
import { runWithApplicationPluginOwner } from '../../plugins/callback-execution.js'
import type { CompiledMutationCommand } from '../../plugins/command-graph.js'
import {
	formatPluginIdentity,
	type PluginIdentity,
} from '../../plugins/manifest.js'
import type { SchemaDefinition } from '../../schema/index.js'
import type { RequestContext } from '../context/request-context.js'
import { getSchemaMutationWireCodec } from './transport-capabilities.js'
import type { SchemaMutationTransportBindingDefinition } from './transport-contracts.js'

export interface OwnedSchemaMutationTransportBinding {
	readonly binding: SchemaMutationTransportBindingDefinition
	readonly contributionId: string
	readonly owner: PluginIdentity
}

const mutationFailure = (
	command: CompiledMutationCommand,
	kind: string,
	message: string,
	cause?: unknown,
	contributionId?: string,
): FrameworkError<'PLUGIN_OPERATION_INVALID'> =>
	new FrameworkError('PLUGIN_OPERATION_INVALID', message, {
		cause,
		publicMessage: 'The requested operation could not be completed.',
		internalDetails: {
			kind,
			operation: command.definition.name,
			plugin: formatPluginIdentity(command.owner),
			...(contributionId === undefined ? {} : { contributionId }),
		},
	})

/** Resolves exact application-owned handlers without exposing them in the graph. */
export class PluginSchemaMutationRuntime {
	readonly #bindings: CommandBindings

	constructor(
		private readonly application: FrameworkApplication<
			readonly SchemaDefinition[],
			readonly PluginDefinition[]
		>,
	) {
		const graph = readApplicationKernelState(application).commands
		this.#bindings = graph.bindings
		// Missing selected resolvers still fail when Runtime is assembled, not in pure compilation.
		for (const command of graph.commands) {
			if (command.kind !== 'mutation' || command.surfaces.length === 0) continue
			if (this.#bindings.handler(command) === undefined) {
				throw mutationFailure(
					command,
					'schema-mutation-handler-missing',
					`Schema mutation ${command.definition.name} has no installed handler.`,
				)
			}
		}
	}

	/** Invokes one exact resolver under its retained plugin attribution. */
	async resolve(
		command: CompiledMutationCommand,
		schema: SchemaDefinition,
		envelope: PluginSchemaMutationEnvelope,
		context: RequestContext,
		originalItem: Readonly<Record<string, unknown>>,
	): Promise<unknown> {
		const owned = this.#bindings.handler(command)
		if (owned?.kind !== 'mutation') {
			throw mutationFailure(
				command,
				'schema-mutation-handler-missing',
				`Schema mutation ${command.definition.name} has no installed handler.`,
			)
		}
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
			return await runWithApplicationPluginOwner(
				this.application,
				owned.owner,
				invoke,
			)
		} catch (error: unknown) {
			if (
				error instanceof PluginError &&
				typeof error.code === 'string' &&
				command.definition.errors.includes(error.code)
			) {
				throw error
			}
			if (error instanceof FrameworkError) throw error
			throw mutationFailure(
				command,
				'schema-mutation-handler-failed',
				`Schema mutation ${command.definition.name} handler failed.`,
				error,
				owned.contributionId,
			)
		}
	}

	/** Decodes one payload under the exact binding owner's attribution. */
	decodeTransportInput(
		binding: OwnedSchemaMutationTransportBinding,
		value: unknown,
	): unknown {
		const codec = getSchemaMutationWireCodec(binding.binding.codec)
		if (codec === undefined) {
			throw new TypeError('Schema mutation transport codec is unavailable')
		}
		return runWithApplicationPluginOwner(this.application, binding.owner, () =>
			codec.decode(value),
		)
	}
}
