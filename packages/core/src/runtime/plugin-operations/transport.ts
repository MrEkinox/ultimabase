import { immutableRecord, isPlainRecord } from '@ultimabase/shared'

import type { AnonymousRequestAccess } from '../../access/index.js'
import type { ApplicationOperationBinding } from '../../application/application-handles.js'
import { FrameworkError } from '../../errors/framework-error.js'
import type { CompiledPluginOperation } from '../../plugins/application-surface-registry.js'
import type { PluginOperationDefinition } from '../../plugins/plugin-operations.js'
import { assertImmutableOperationValue } from '../../plugins/plugin-operation-boundaries.js'
import { RequestContext } from '../context/request-context.js'
import type { RequestEngine } from '../engine/framework-engine.js'
import { executeRequestPluginOperation } from './request-execution.js'
import type { OperationTransportProtocol } from './contracts.js'
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
> {
	/**
	 * Confirms that this public transport intentionally starts without a
	 * protected policy contribution.
	 *
	 * @example `acknowledgeUnprotected: true`
	 */
	readonly acknowledgeUnprotected?: true
	readonly operations: readonly (PluginOperationDefinition | string)[]
	readonly transport: TTransport
}

/** Describes the stable startup warning for an intentionally public surface. */
export interface UnprotectedPublicTransportWarning {
	readonly code: 'UNPROTECTED_PUBLIC_TRANSPORT'
	readonly message: string
	readonly transport: Readonly<{
		readonly name: string
		readonly version: string
	}>
}

/** Carries untrusted wire input with an already validated anonymous request context. */
export interface OperationTransportRequest {
	readonly context: RequestContext<AnonymousRequestAccess>
	readonly input: unknown
	readonly operation: string
	readonly version: string
}

/** Executes only the fixed allowlist selected when this exposure was created. */
export interface ApplicationOperationTransport<
	TTransport extends OperationTransportProtocol = OperationTransportProtocol,
> {
	readonly transport: TTransport
	/** Decodes, executes, validates, and encodes one explicitly exposed operation. */
	execute(request: OperationTransportRequest): Promise<unknown>
}

/** Keeps construction dependencies private while exposing only the transport facade. */
export class CoreApplicationOperationTransport<
	TTransport extends OperationTransportProtocol,
> implements ApplicationOperationTransport<TTransport> {
	readonly transport: TTransport
	constructor(
		transport: TTransport,
		private readonly operations: ReadonlyMap<string, ExposedOperation>,
		private readonly runtime: PluginOperationRuntime,
		private readonly createEngine: (context: RequestContext) => RequestEngine,
	) {
		this.transport = transport
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
		if (context.access.mode !== 'anonymous') {
			throw new FrameworkError(
				'PERMISSION_DENIED',
				'Public operation transports accept anonymous Core authority only.',
				{ publicMessage: 'The request authority is not available.' },
			)
		}
		const exposed = this.operations.get(request.operation)
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
				{ publicMessage: 'The requested operation version is not available.' },
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
		const binding: ApplicationOperationBinding = immutableRecord({})
		const result = await executeRequestPluginOperation(
			this.createEngine(context),
			exposed.compiled,
			binding,
			envelope,
		)
		return this.runtime.encode(exposed.binding, result)
	}
}
