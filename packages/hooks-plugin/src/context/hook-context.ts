import type {
	Principal,
	RequestAccess,
	RequestCapability,
	RequestContextValue,
} from '@ultimabase/core'
import type { JsonDocument, OperationKind } from '@ultimabase/core'

/**
 * Defines the durable minimal execution identity implemented by HookContext.
 *
 * Consumers needing only correlation and cancellation may depend on this
 * interface without acquiring query or event capabilities.
 */
export interface HookExecutionContext {
	/** Stable identifier shared by every operation in the originating request. */
	readonly requestId: string
	/** Framework-owned identifier shared by one explicit or automatic transaction. */
	readonly transactionId: string | undefined
	/** Cooperative cancellation signal inherited from the originating request. */
	readonly signal: AbortSignal
}

/** Selects whether one emitted event requires at least one configured consumer. */
export type HookEventDelivery = 'optional' | 'required'

declare const hookEventPayloadType: unique symbol

/** Carries one trusted named-event delivery contract into `HookContext.emit()`. */
export interface HookEventContract<
	TName extends string = string,
	TPayload extends JsonDocument = JsonDocument,
	TDelivery extends HookEventDelivery = HookEventDelivery,
> {
	readonly kind: 'hook-event-contract'
	readonly name: TName
	readonly delivery: TDelivery
	readonly [hookEventPayloadType]?: TPayload
}

/** Identifies application or plugin ownership without exposing callback state. */
export type HookContextOwner =
	| Readonly<{ readonly kind: 'application' }>
	| Readonly<{
			readonly kind: 'plugin'
			readonly pluginName: string
			readonly pluginInstanceId?: string
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

/** Identifies native terminals and the generic plugin-owned schema mutation path. */
export type HookOperationKind = OperationKind | 'plugin-schema-mutation'

/** Describes the exact declaration occurrence currently being executed. */
export interface HookContextIdentity {
	/** Identifies the direct or family branch containing the callback. */
	readonly declarationBranch: string
	/** Gives the callback position within its original declaration branch. */
	readonly handlerIndex: number
	/** Identifies the terminal operation that reached the callback. */
	readonly operationKind: HookOperationKind
	/** Identifies whether application code or one plugin owns the declaration. */
	readonly owner: HookContextOwner
	/** Identifies the lifecycle phase without exposing the callback. */
	readonly phase: string
	/** Identifies the schema, field path, or global scope statically. */
	readonly target: HookContextTarget
}

/** @internal Supplies revocable behavior without exposing Runtime dependencies. */
export interface HookContextCapabilities {
	emit(event: string | HookEventContract, payload: JsonDocument): void
	getValue<TValue>(token: RequestContextValue<TValue>): TValue | undefined
	hasCapability(capability: RequestCapability): boolean
}

/** @internal Supplies already validated immutable state to the trusted factory. */
export interface CreateHookContextOptions {
	readonly access: RequestAccess
	readonly hook: HookContextIdentity
	readonly principal: Principal | undefined
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
	/**
	 * The request principal resolved by Core, `undefined` when anonymous
	 * (ADR-0304); it stays the same under `useMasterKey`.
	 * @example `const author = context.principal`
	 */
	readonly principal: Principal | undefined
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
		this.principal = options.principal
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
	 * A string name retains required-delivery behavior. Pass a contract created by
	 * `defineEvent()` when zero consumers should be valid.
	 *
	 * @example `context.emit(postCreatedEvent, { postId: result.id })`
	 */
	emit<
		const TName extends string,
		TPayload extends JsonDocument,
		TDelivery extends HookEventDelivery,
	>(
		event: HookEventContract<TName, TPayload, TDelivery>,
		payload: TPayload,
	): void
	emit(name: string, payload: JsonDocument): void
	emit(event: string | HookEventContract, payload: JsonDocument): void {
		requireHookContextCapabilities(this).emit(event, payload)
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
