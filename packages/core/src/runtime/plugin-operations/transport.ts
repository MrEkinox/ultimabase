import { runApplicationWork } from '../../application/active-application.js'
import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

import { FrameworkError } from '../../errors/framework-error.js'
import type { CompiledPluginOperation } from '../../plugins/application-surface-registry.js'
import { assertImmutableOperationValue } from '../../plugins/plugin-operation-boundaries.js'
import type { PluginOperationDefinition } from '../../plugins/plugin-operations.js'
import type { JsonValue } from '../../schema/index.js'
import { RequestContext } from '../context/request-context.js'
import type { RequestEngine } from '../engine/framework-engine.js'
import type { OperationTransportProtocol } from './contracts.js'
import { executeRequestPluginOperation } from './request-execution.js'
import type {
	OwnedTransportBinding,
	PluginOperationRuntime,
} from './runtime.js'

interface ExposedOperation {
	readonly binding: OwnedTransportBinding
	readonly compiled: CompiledPluginOperation
}

const isRequestContext = (value: unknown): value is RequestContext =>
	value instanceof RequestContext

/** Explicitly selects which operation tokens one transport may invoke. */
export interface OperationTransportExposureOptions<
	TTransport extends OperationTransportProtocol = OperationTransportProtocol,
> extends PublicTransportProtectionOptions<TTransport> {
	readonly operations: readonly (PluginOperationDefinition | string)[]
}

/** Reports the public-protection state for one transport protocol. */
export interface PublicTransportProtectionOptions<
	TTransport extends OperationTransportProtocol = OperationTransportProtocol,
> {
	/**
	 * Confirms that the developer accepts Core cannot prove complete policy
	 * coverage for this public exposure.
	 *
	 * @example `acknowledgeUnverifiedProtection: true`
	 */
	readonly acknowledgeUnverifiedProtection?: true
	readonly transport: TTransport
}

/** Describes Core's exact knowledge about one public transport exposure. */
export interface PublicTransportProtectionWarning {
	readonly code: 'UNVERIFIED_PUBLIC_TRANSPORT_PROTECTION'
	readonly message: string
	/** Separates observable provider inventory from unprovable complete coverage. */
	readonly policy: Readonly<{
		/** Remains unverified until a future executable coverage contract exists. */
		readonly coverage: 'unverified'
		/** Reports only whether Core materialized at least one protected policy. */
		readonly providerPresence: 'none' | 'present'
	}>
	readonly transport: Readonly<{
		readonly name: string
		readonly version: string
	}>
}

/** Carries untrusted wire input with an application-validated request context. */
export interface OperationTransportRequest {
	readonly context: RequestContext
	readonly input: unknown
	readonly operation: string
	readonly version: string
}

/** Describes one exact operation and its inert binding facts after exposure. */
export interface ExposedOperationTransportBinding {
	readonly errors: readonly string[]
	readonly metadata: JsonValue
	readonly name: string
	readonly owner: Readonly<{
		readonly instanceId?: string
		readonly pluginId: string
		readonly version: string
	}>
	readonly version: string
}

/** Executes only the fixed allowlist selected when this exposure was created. */
export interface ApplicationOperationTransport<
	TTransport extends OperationTransportProtocol = OperationTransportProtocol,
> {
	readonly operations: readonly ExposedOperationTransportBinding[]
	readonly transport: TTransport
	/** Decodes, executes, validates, and encodes one explicitly exposed operation. */
	execute(request: OperationTransportRequest): Promise<unknown>
}

/** Keeps construction dependencies private while exposing only the transport facade. */
export class CoreApplicationOperationTransport<
	TTransport extends OperationTransportProtocol,
> implements ApplicationOperationTransport<TTransport> {
	readonly operations: readonly ExposedOperationTransportBinding[]
	readonly transport: TTransport
	constructor(
		transport: TTransport,
		private readonly exposed: ReadonlyMap<string, ExposedOperation>,
		private readonly runtime: PluginOperationRuntime,
		private readonly createEngine: (context: RequestContext) => RequestEngine,
	) {
		this.transport = transport
		this.operations = Object.freeze(
			[...this.exposed.values()].map(({ binding, compiled }) =>
				immutableRecord({
					errors: compiled.operation.errors,
					metadata: binding.binding.metadata,
					name: compiled.operation.name,
					owner: immutableRecord({
						...(compiled.owner.instanceId === undefined
							? {}
							: { instanceId: compiled.owner.instanceId }),
						pluginId: compiled.owner.pluginId,
						version: compiled.owner.version,
					}),
					version: compiled.operation.version,
				}),
			),
		)
		Object.freeze(this)
	}

	async execute(request: OperationTransportRequest): Promise<unknown> {
		if (!isPlainRecord(request)) {
			throw new TypeError('operation transport request must be a plain object')
		}
		const context: unknown = request.context
		if (!isRequestContext(context)) {
			throw new TypeError(
				'operation transport request context must be a RequestContext',
			)
		}
		// Application lifecycle and context provenance must pass before codecs run.
		const engine = this.createEngine(context)
		return runApplicationWork(engine.application, async () => {
			const exposed = this.exposed.get(request.operation)
			if (exposed === undefined) {
				throw new FrameworkError(
					'PLUGIN_OPERATION_INVALID',
					`Operation ${request.operation} is not exposed through ${this.transport.name}.`,
					{ publicMessage: 'The requested operation is not available.' },
				)
			}
			if (request.version !== exposed.compiled.operation.version) {
				throw new FrameworkError(
					'PLUGIN_PROTOCOL_INCOMPATIBLE',
					`Operation ${request.operation} version ${request.version} is incompatible with ${exposed.compiled.operation.version}.`,
					{
						publicMessage: 'The requested operation version is not available.',
					},
				)
			}
			const decoded = this.runtime.decode(exposed.binding, request.input)
			const payload = exposed.compiled.operation.input.snapshot(
				decoded,
				`${exposed.compiled.operation.name}.input`,
			)
			assertImmutableOperationValue(
				payload,
				`${exposed.compiled.operation.name}.input`,
			)
			const envelope = immutableRecord({
				kind: 'plugin-operation' as const,
				name: exposed.compiled.operation.name,
				payload,
				target: immutableRecord({ kind: 'application' as const }),
				transaction: exposed.compiled.operation.transaction,
				version: exposed.compiled.operation.version,
			})
			const result = await executeRequestPluginOperation(
				engine,
				exposed.compiled,
				envelope,
			)
			return this.runtime.encode(exposed.binding, result)
		})
	}
}
