import { runApplicationWork } from '../../application/active-application.js'
import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
} from '@ultimabase/shared'

import type { PluginSchemaMutationEnvelope } from '../../application/application-schema-mutations.js'
import { FrameworkError } from '../../errors/framework-error.js'
import type { CompiledSchemaMutationCommand } from '../../plugins/application-surface-registry.js'
import { readPluginSchemaMutationSource } from '../../plugins/plugin-schema-mutations.js'
import { assertImmutableOperationValue } from '../../plugins/plugin-operation-boundaries.js'
import { queryFromFindOneInput } from '../../query/query/input.js'
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
	readonly commandName: string
	readonly command: CompiledSchemaMutationCommand
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

const createDescriptor = (
	exposed: ExposedSchemaMutation,
): ExposedSchemaMutationTransportBinding =>
	immutableRecord({
		authority: exposed.command.mutation.authority,
		command: exposed.commandName,
		effect: exposed.command.mutation.effect,
		errors: exposed.command.mutation.errors,
		metadata: exposed.binding.binding.metadata,
		mutation: exposed.command.mutation.name,
		owner: exposed.command.owner,
		returning: exposed.command.mutation.returning,
		schema: exposed.schema.className,
		version: exposed.command.mutation.version,
	})

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
			this.#exposed.set(createDescriptor(item), item)
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
				operation: exposed.command.mutation.name,
				stage: 'transport-input',
			})
			const decoded = this.runtime.decodeTransportInput(
				exposed.binding,
				request.input,
			)
			const source = readPluginSchemaMutationSource(exposed.command.mutation)
			const payload = source.input.snapshot(decoded, `${source.name}.input`)
			assertImmutableOperationValue(payload, `${source.name}.input`)
			const projection = queryFromFindOneInput(request.schema, {
				...(request.include === undefined ? {} : { include: request.include }),
				...(request.select === undefined ? {} : { select: request.select }),
				where: { id: { eq: request.id } },
			} as never)
			const envelope: PluginSchemaMutationEnvelope = immutableRecord({
				command: exposed.commandName,
				id: request.id,
				kind: 'plugin-schema-mutation' as const,
				mutation: exposed.command.mutation,
				payload,
				query: projection.ast,
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
