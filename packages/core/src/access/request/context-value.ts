import { assertNonEmptyString } from '@ultimabase/shared'

/** Validates untrusted input and returns the detached value retained by a context. */
export type RequestContextValueSnapshot<TValue> = (value: unknown) => TValue

/** Extracts the exact value carried by one nominal request-context token. */
export type RequestContextValueType<
	TToken extends RequestContextValue<unknown>,
> = TToken extends RequestContextValue<infer TValue> ? TValue : never

/**
 * Defines one plugin-owned typed request value that transport strings cannot
 * reproduce.
 *
 * The snapshot callback is the token owner's validation boundary. It must
 * return a detached immutable value suitable for the complete request lifetime.
 *
 * @example
 * ```ts
 * const principal = new RequestContextValue<Readonly<{ id: string }>>(
 *   'auth.principal',
 *   (value) => validatePrincipal(value),
 * )
 * ```
 */
export class RequestContextValue<TValue, const TName extends string = string> {
	// The type-only private member prevents structurally forged token objects.
	declare private readonly requestContextValueIdentity: TValue

	readonly name: TName
	readonly #snapshot: RequestContextValueSnapshot<TValue>

	constructor(name: TName, snapshot: RequestContextValueSnapshot<TValue>) {
		assertNonEmptyString(name, 'Request context value name')

		if (typeof snapshot !== 'function') {
			throw new TypeError('Request context value snapshot must be a function')
		}

		this.name = name
		this.#snapshot = snapshot

		// Token identity and its validation boundary remain stable across requests.
		Object.freeze(this)
	}

	/** Validates and snapshots one value before an immutable context retains it. */
	snapshot(value: unknown): TValue {
		return this.#snapshot(value)
	}
}
