import type { PluginOperationPublicDeclaration } from '../../plugins/plugin-command-contribution-contracts.js'
import type { PluginOperationDefinition } from '../../plugins/plugin-operations.js'
import type { JsonValue } from '../../schema/index.js'
import type { RequestContext } from '../context/request-context.js'
import type { OperationTransportProtocol } from './contracts.js'

/** Explicitly selects which operation tokens one transport may invoke. */
export interface OperationTransportExposureOptions<
	TTransport extends OperationTransportProtocol = OperationTransportProtocol,
> {
	readonly operations: readonly (PluginOperationDefinition | string)[]
	readonly transport: TTransport
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
	/**
	 * `true` when the owner bound the operation to this transport; `false` for
	 * a public operation that keeps its wire value as is (ADR-0324).
	 */
	readonly bound: boolean
	readonly errors: readonly string[]
	readonly metadata: JsonValue
	readonly name: string
	readonly owner: Readonly<{
		readonly instanceId?: string
		readonly pluginId: string
		readonly version: string
	}>
	/** The owner's public declaration, when the operation is public (ADR-0324). */
	readonly public?: PluginOperationPublicDeclaration
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
