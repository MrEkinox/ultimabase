import { runApplicationWork } from '../../application/active-application.js'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import { prepareSchemaMutationEnvelope } from '../../application/schema-mutation-envelope.js'
import { readApplicationKernelState } from '../../application/application-kernel-state.js'
import type { CompiledMutationCommand } from '../../plugins/command-graph.js'
import { FrameworkError } from '../../errors/framework-error.js'
import type { CompiledSchemaMutationCommand } from '../../plugins/application-surface-registry.js'
import type { JsonValue, SchemaDefinition } from '../../schema/index.js'
import { throwIfOperationCancelled } from '../cancellation/operation-cancellation.js'
import { RequestContext } from '../context/request-context.js'
import type { RequestEngine } from '../engine/framework-engine.js'
import type { OperationTransportProtocol } from '../plugin-operations/contracts.js'
import type { PublicTransportProtectionOptions } from '../plugin-operations/transport.js'
import { executeRequestSchemaMutation } from './request-execution.js'
import type {
	OwnedSchemaMutationTransportBinding,
	PluginSchemaMutationRuntime,
} from './runtime.js'

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

interface ExposedSchemaMutation {
	readonly binding: OwnedSchemaMutationTransportBinding
	readonly descriptor: ExposedSchemaMutationTransportBinding
	readonly commandName: string
	readonly command: CompiledMutationCommand
	readonly schema: SchemaDefinition
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

/** @internal Retains executable codecs and commands behind inert descriptors. */
export class CoreApplicationSchemaMutationTransport<
	TTransport extends OperationTransportProtocol,
> implements ApplicationSchemaMutationTransport<TTransport> {
	readonly mutations: readonly ExposedSchemaMutationTransportBinding[]
	readonly transport: TTransport
	readonly #exposed = new Map<
		ExposedSchemaMutationTransportBinding,
		ExposedSchemaMutation
	>()

	constructor(
		transport: TTransport,
		exposed: readonly ExposedSchemaMutation[],
		private readonly runtime: PluginSchemaMutationRuntime,
		private readonly createEngine: (context: RequestContext) => RequestEngine,
	) {
		this.transport = transport
		for (const item of exposed) {
			this.#exposed.set(item.descriptor, item)
		}
		this.mutations = immutableArray([...this.#exposed.keys()])
		Object.freeze(this)
	}

	async execute(request: SchemaMutationTransportRequest): Promise<unknown> {
		if (!isPlainRecord(request)) {
			throw new TypeError(
				'schema mutation transport request must be a plain object',
			)
		}
		for (const key of Object.keys(request)) {
			if (!requestKeys.has(key)) {
				throw new TypeError(
					`schema mutation transport request contains unknown key: ${key}`,
				)
			}
		}
		if (!(request.context instanceof RequestContext)) {
			throw new TypeError(
				'schema mutation transport request context must be a RequestContext',
			)
		}
		// Context provenance and application lifecycle fail before owner codecs run.
		const engine = this.createEngine(request.context)
		return runApplicationWork(engine.application, async () => {
			const exposed = this.#exposed.get(request.binding)
			if (exposed?.schema !== request.schema) {
				throw new FrameworkError(
					'PLUGIN_OPERATION_INVALID',
					'Schema mutation transport binding is not exposed by this application.',
					{ publicMessage: 'The requested operation is not available.' },
				)
			}
			if (typeof request.id !== 'string' || request.id.length === 0) {
				throw new TypeError('schema mutation transport id must be a string')
			}
			throwIfOperationCancelled(request.context.signal, {
				operation: exposed.command.definition.name,
				stage: 'transport-input',
			})
			const decoded = this.runtime.decodeTransportInput(
				exposed.binding,
				request.input,
			)
			const envelope = prepareSchemaMutationEnvelope({
				graph: readApplicationKernelState(engine.application).commands,
				command: exposed.command,
				schema: request.schema,
				name: exposed.commandName,
				id: request.id,
				input: decoded,
				projection: request,
			})
			return executeRequestSchemaMutation(
				engine,
				exposed.command,
				request.schema,
				envelope,
				immutableRecord({
					context: undefined,
					ultimabase: undefined,
					useMasterKey: false,
				}),
			)
		})
	}
}
