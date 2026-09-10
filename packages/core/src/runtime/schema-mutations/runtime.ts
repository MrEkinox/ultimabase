import { immutableRecord } from '@ultimabase/shared'

import type { PluginSchemaMutationEnvelope } from '../../application/application-schema-mutations.js'
import { FrameworkError } from '../../errors/framework-error.js'
import { PluginError } from '../../errors/plugin-error.js'
import type {
	FrameworkApplication,
	PluginDefinition,
} from '../../foundation.js'
import { readApplicationCapabilityContributions } from '../../plugins/application-capability-access.js'
import { runWithApplicationPluginOwner } from '../../plugins/callback-execution.js'
import type { CompiledSchemaMutationCommand } from '../../plugins/application-surface-registry.js'
import {
	formatPluginIdentity,
	type PluginIdentity,
} from '../../plugins/manifest.js'
import { readPluginSchemaMutationSource } from '../../plugins/plugin-schema-mutations.js'
import type { SchemaDefinition } from '../../schema/index.js'
import type { RequestContext } from '../context/request-context.js'
import {
	getPluginSchemaMutationHandler,
	pluginSchemaMutationHandlerCapability,
} from './capabilities.js'
import type { PluginSchemaMutationHandler } from './contracts.js'

interface OwnedSchemaMutationHandler {
	readonly contributionId: string
	readonly owner: PluginIdentity
	readonly resolve: PluginSchemaMutationHandler
}

const sameOwner = (
	command: CompiledSchemaMutationCommand,
	contribution: {
		readonly owner: PluginIdentity
		readonly pluginVersion: string
	},
): boolean =>
	command.owner.pluginId === contribution.owner.pluginId &&
	command.owner.instanceId === contribution.owner.instanceId &&
	command.owner.version === contribution.pluginVersion

const mutationFailure = (
	command: CompiledSchemaMutationCommand,
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
			operation: command.mutation.name,
			plugin: formatPluginIdentity(command.owner),
			...(contributionId === undefined ? {} : { contributionId }),
		},
	})

/** Resolves exact application-owned handlers without exposing them in the graph. */
export class PluginSchemaMutationRuntime {
	readonly #handlers = new Map<object, OwnedSchemaMutationHandler>()

	constructor(
		private readonly application: FrameworkApplication<
			readonly SchemaDefinition[],
			readonly PluginDefinition[]
		>,
	) {
		const commands = new Map<object, CompiledSchemaMutationCommand>()
		for (const schema of application.schemas.values()) {
			const surface = application.getSchemaSurface(schema.className)
			for (const command of [
				...(surface?.schemaMutations.values() ?? []),
				...(surface?.modelMutations.values() ?? []),
			]) {
				commands.set(readPluginSchemaMutationSource(command.mutation), command)
			}
		}

		for (const contribution of readApplicationCapabilityContributions(
			application,
			pluginSchemaMutationHandlerCapability,
		)) {
			const definition = contribution.value
			const resolve = getPluginSchemaMutationHandler(definition)
			const command = commands.get(definition.mutation)
			if (
				resolve === undefined ||
				command === undefined ||
				!sameOwner(command, contribution)
			) {
				throw new FrameworkError(
					'PLUGIN_OPERATION_INVALID',
					`Plugin "${formatPluginIdentity(contribution.owner)}" provided an invalid schema mutation handler.`,
					{
						internalDetails: {
							kind: 'schema-mutation-handler-owner-invalid',
							plugin: formatPluginIdentity(contribution.owner),
							contributionId: contribution.contributionId,
						},
					},
				)
			}
			if (this.#handlers.has(definition.mutation)) {
				throw mutationFailure(
					command,
					'schema-mutation-handler-conflict',
					`Schema mutation ${command.mutation.name} has multiple handlers.`,
				)
			}
			this.#handlers.set(
				definition.mutation,
				immutableRecord({
					contributionId: contribution.contributionId,
					owner: immutableRecord(contribution.owner),
					resolve,
				}),
			)
		}

		for (const [mutation, command] of commands) {
			if (!this.#handlers.has(mutation)) {
				throw mutationFailure(
					command,
					'schema-mutation-handler-missing',
					`Schema mutation ${command.mutation.name} has no installed handler.`,
				)
			}
		}
	}

	/** Invokes one exact resolver under its retained plugin attribution. */
	async resolve(
		command: CompiledSchemaMutationCommand,
		schema: SchemaDefinition,
		envelope: PluginSchemaMutationEnvelope,
		context: RequestContext,
		originalItem: Readonly<Record<string, unknown>>,
	): Promise<unknown> {
		const source = readPluginSchemaMutationSource(command.mutation)
		const owned = this.#handlers.get(source)
		if (owned === undefined) {
			throw mutationFailure(
				command,
				'schema-mutation-handler-missing',
				`Schema mutation ${command.mutation.name} has no installed handler.`,
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
				command.mutation.errors.includes(error.code)
			) {
				throw error
			}
			if (error instanceof FrameworkError) throw error
			throw mutationFailure(
				command,
				'schema-mutation-handler-failed',
				`Schema mutation ${command.mutation.name} handler failed.`,
				error,
				owned.contributionId,
			)
		}
	}
}
