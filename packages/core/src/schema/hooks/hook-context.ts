import type {
	RequestAccess,
	RequestCapability,
	RequestContextValue,
} from '../../access/index.js'
import type { OperationKind } from '../../query/index.js'
import type { JsonDocument } from '../fields/builtins/json.js'
import type { HookExecutionContext } from './execution-context.js'

/** Identifies application or plugin ownership without exposing callback state. */
export type HookContextOwner =
	| Readonly<{ readonly kind: 'application' }>
	| Readonly<{
			readonly kind: 'plugin'
			readonly pluginName: string
			readonly contributionName: string
	  }>

/** Identifies the static declaration target without retaining business values. */
export type HookContextTarget =
	| Readonly<{ readonly kind: 'schema'; readonly className: string }>
	| Readonly<{
			readonly kind: 'field'
			readonly className: string
			readonly path: readonly string[]
	  }>
	| Readonly<{ readonly kind: 'global' }>

/** Describes the exact declaration occurrence currently being executed. */
export interface HookContextIdentity {
	/** Identifies the direct or family branch containing the callback. */
	readonly declarationBranch: string
	/** Gives the callback position within its original declaration branch. */
	readonly handlerIndex: number
	/** Identifies the terminal operation that reached the callback. */
	readonly operationKind: OperationKind
	/** Identifies whether application code or one plugin owns the declaration. */
	readonly owner: HookContextOwner
	/** Identifies the lifecycle phase without exposing the callback. */
	readonly phase: string
	/** Identifies the schema, field path, or global scope statically. */
	readonly target: HookContextTarget
}

/** @internal Supplies revocable behavior without exposing Runtime dependencies. */
export interface HookContextCapabilities {
	emit(name: string, payload: JsonDocument): void
	getValue<TValue>(token: RequestContextValue<TValue>): TValue | undefined
	hasCapability(capability: RequestCapability): boolean
}

/** @internal Supplies already validated immutable state to the trusted factory. */
export interface CreateHookContextOptions {
	readonly access: RequestAccess
	readonly hook: HookContextIdentity
	readonly requestId: string
	readonly signal: AbortSignal
	readonly source: string
	readonly transactionId: string | undefined
}

type TrustedHookContextFactory = (
	options: CreateHookContextOptions,
	capabilities: HookContextCapabilities,
) => HookContext

const hookContextConstructionKey: unique symbol = Symbol(
	'ultimabase.hook-context-construction',
)
const hookContextCapabilities = new WeakMap<
	HookContext,
	HookContextCapabilities
>()
let trustedHookContextFactory: TrustedHookContextFactory

const requireHookContextCapabilities = (
	context: HookContext,
): HookContextCapabilities => {
	const capabilities = hookContextCapabilities.get(context)

	if (capabilities === undefined) {
		throw new TypeError('Hook context capabilities are unavailable')
	}

	return capabilities
}

/**
 * Exposes immutable request identity and lifecycle-bound framework capabilities.
 *
 * Runtime constructs this class for every hook invocation. It never exposes
 * request metadata, credentials, adapters, commit controls, or hook bypasses.
 */
export class HookContext implements HookExecutionContext {
	/** Exposes ordinary anonymous or audited-master Core authority. */
	readonly access: RequestAccess
	/** Identifies the exact hook declaration currently being executed. */
	readonly hook: HookContextIdentity
	/** Correlates every operation started by the originating request. */
	readonly requestId: string
	/** Propagates cooperative cancellation without exposing its controller. */
	readonly signal: AbortSignal
	/** Identifies the transport or internal request source. */
	readonly source: string
	/** Correlates work sharing one automatic or explicit transaction. */
	readonly transactionId: string | undefined

	private constructor(
		constructionKey: typeof hookContextConstructionKey,
		options: CreateHookContextOptions,
		capabilities: HookContextCapabilities,
	) {
		if (constructionKey !== hookContextConstructionKey) {
			throw new TypeError('HookContext must be created by Runtime')
		}

		this.access = options.access
		this.hook = options.hook
		this.requestId = options.requestId
		this.signal = options.signal
		this.source = options.source
		this.transactionId = options.transactionId
		hookContextCapabilities.set(this, capabilities)

		// Public state is immutable while Runtime retains revocable capabilities.
		Object.freeze(this)
	}

	/**
	 * Queues one portable event for delivery only after the transaction commits.
	 *
	 * @example `context.emit('post.created', { postId: result.id })`
	 */
	emit(name: string, payload: JsonDocument): void {
		requireHookContextCapabilities(this).emit(name, payload)
	}

	/**
	 * Reads one optional plugin-owned request value without exposing derivation.
	 *
	 * @example `context.getValue(authenticatedPrincipal)?.id`
	 */
	getValue<TValue>(token: RequestContextValue<TValue>): TValue | undefined {
		return requireHookContextCapabilities(this).getValue(token)
	}

	/** Checks one framework capability token without exposing request metadata. */
	hasCapability(capability: RequestCapability): boolean {
		return requireHookContextCapabilities(this).hasCapability(capability)
	}

	static {
		// Runtime receives one non-public construction closure without a forgeable key.
		trustedHookContextFactory = (options, capabilities) =>
			new HookContext(hookContextConstructionKey, options, capabilities)
	}
}

/** Constructs one revocable context inside Runtime without exporting a public constructor. */
export const createTrustedHookContext = (
	options: CreateHookContextOptions,
	capabilities: HookContextCapabilities,
): HookContext => trustedHookContextFactory(options, capabilities)
