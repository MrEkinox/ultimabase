import { immutableArray, immutableRecord } from '@ultimabase/shared'

import { runApplicationWork } from '../../application/active-application.js'
import { readApplicationKernelState } from '../../application/application-kernel-state.js'
import { prepareSchemaMutationEnvelope } from '../../application/schema-mutation-envelope.js'
import { FrameworkError } from '../../errors/framework-error.js'
import { assertExactEnumerablePlainObject } from '../../exact-object-validation.js'
import type { CompiledSchemaMutationCommand } from '../../plugins/application-surface-registry.js'
import type { JsonValue, SchemaDefinition } from '../../schema/index.js'
import { throwIfOperationCancelled } from '../cancellation/operation-cancellation.js'
import { projectSchemaMutationTransports } from '../commands/transport-projection.js'
import {
	isRequestContext,
	type RequestContext,
} from '../context/request-context.js'
import { assertApplicationRequestExecutionAvailable } from '../engine/application-binding.js'
import type { FrameworkEngine } from '../engine/framework-engine.js'
import type { OperationTransportProtocol } from '../plugin-operations/contracts.js'
import {
	assertTransportExposureOptions,
	reportFrameworkPublicTransportProtection,
} from '../plugin-operations/engine-integration.js'
import type { PublicTransportProtectionOptions } from '../plugin-operations/transport.js'
import { executeRequestSchemaMutation } from './request-execution.js'
import { decodeSchemaMutationInput } from './runtime.js'

/** Contains only the inert facts needed to compile and bind one public route. */
export interface ExposedSchemaMutationTransportBinding {
	readonly authority: CompiledSchemaMutationCommand['mutation']['authority']
	readonly command: string
	readonly effect: CompiledSchemaMutationCommand['mutation']['effect']
	readonly errors: readonly string[]
	readonly metadata: JsonValue
	readonly mutation: string
	readonly owner: Readonly<{
		readonly instanceId?: string
		readonly pluginId: string
		readonly version: string
	}>
	readonly returning: CompiledSchemaMutationCommand['mutation']['returning']
	readonly schema: string
	readonly version: string
}

/** Selects every schema-local binding for one exact transport protocol. */
export type SchemaMutationTransportExposureOptions<
	TTransport extends OperationTransportProtocol = OperationTransportProtocol,
> = PublicTransportProtectionOptions<TTransport>

/** Carries one route-selected mutation through the exact executable allowlist. */
export interface SchemaMutationTransportRequest {
	readonly binding: ExposedSchemaMutationTransportBinding
	readonly context: RequestContext
	readonly id: string
	readonly include?: unknown
	readonly input: unknown
	readonly schema: SchemaDefinition
	readonly select?: unknown
}

/** Executes only descriptors returned by this exact application exposure. */
export interface ApplicationSchemaMutationTransport<
	TTransport extends OperationTransportProtocol = OperationTransportProtocol,
> {
	readonly mutations: readonly ExposedSchemaMutationTransportBinding[]
	readonly transport: TTransport
	execute(request: SchemaMutationTransportRequest): Promise<unknown>
}

const requestKeys = new Set([
	'binding',
	'context',
	'id',
	'include',
	'input',
	'schema',
	'select',
])

/** Builds the complete exact schema-mutation allowlist for one protocol. */
export const exposeFrameworkSchemaMutations = <
	const TTransport extends OperationTransportProtocol,
>(
	framework: FrameworkEngine,
	options: SchemaMutationTransportExposureOptions<TTransport>,
): ApplicationSchemaMutationTransport<TTransport> => {
	assertTransportExposureOptions(options, [], {
		invalid: 'schema mutation transport exposure requires a transport protocol',
		exposure: 'schema mutation transport exposure',
		ack: 'schema mutation transport',
	})
	const { application } = framework
	const graph = readApplicationKernelState(application).commands
	const exposed = new Map(
		projectSchemaMutationTransports(graph, options.transport).map((entry) => {
			const schema = application.schemas.get(entry.descriptor.schema)
			if (schema === undefined) {
				throw new TypeError('Compiled command schema is unavailable')
			}
			return [entry.descriptor, { ...entry, schema }] as const
		}),
	)
	reportFrameworkPublicTransportProtection(framework, options)

	return immutableRecord({
		mutations: immutableArray([...exposed.keys()]),
		transport: options.transport,
		execute: async (request: SchemaMutationTransportRequest) => {
			const untrustedRequest: unknown = request
			assertExactEnumerablePlainObject(
				untrustedRequest,
				requestKeys,
				'schema mutation transport request must be a plain object',
				'schema mutation transport request contains unknown key: ',
			)
			const context: unknown = request.context
			if (!isRequestContext(context)) {
				throw new TypeError(
					'schema mutation transport request context must be a RequestContext',
				)
			}
			// Context provenance and application lifecycle fail before owner codecs run.
			assertApplicationRequestExecutionAvailable(application)
			const engine = framework.withContext(context)
			return runApplicationWork(application, async () => {
				const entry = exposed.get(request.binding)
				if (entry?.schema !== request.schema) {
					throw new FrameworkError(
						'PLUGIN_OPERATION_INVALID',
						'Schema mutation transport binding is not exposed by this application.',
						{ publicMessage: 'The requested operation is not available.' },
					)
				}
				const id: unknown = request.id
				if (typeof id !== 'string' || id.length === 0) {
					throw new TypeError('schema mutation transport id must be a string')
				}
				throwIfOperationCancelled(context.signal, {
					operation: entry.command.definition.name,
					stage: 'transport-input',
				})
				const input = decodeSchemaMutationInput(
					application,
					entry.binding,
					request.input,
				)
				const envelope = prepareSchemaMutationEnvelope({
					graph,
					command: entry.command,
					schema: entry.schema,
					name: entry.descriptor.command,
					id,
					input,
					projection: request,
				})
				return executeRequestSchemaMutation(
					engine,
					entry.command,
					entry.schema,
					envelope,
					immutableRecord({ context: undefined, useMasterKey: false }),
				)
			})
		},
	})
}
