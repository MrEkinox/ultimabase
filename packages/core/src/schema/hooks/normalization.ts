import {
	immutableRecord,
	isPlainRecord,
	type MaybePromise,
} from '@ultimabase/shared'

/** Erases callback variance only after the public declaration has been type-checked. */
export type ErasedHookHandler = (input: never) => MaybePromise<unknown>

/** Retains a sparse immutable phase map for Runtime-owned composition. */
export type NormalizedHookDeclarations<TPhase extends string> = Readonly<
	Partial<Record<TPhase, ErasedHookHandler>>
>

interface HookDeclarationNormalizationOptions<TPhase extends string> {
	readonly hooks: unknown
	readonly phases: readonly TPhase[]
	readonly scope: string
}

/**
 * Copies one declaration map without executing callbacks or retaining caller state.
 *
 * Schema and field declarations share this boundary so their validation diagnostics
 * and identity-preserving snapshots cannot drift.
 */
export const normalizeHookDeclarations = <TPhase extends string>({
	hooks,
	phases,
	scope,
}: HookDeclarationNormalizationOptions<TPhase>):
	NormalizedHookDeclarations<TPhase> | undefined => {
	if (hooks === undefined) {
		return undefined
	}

	if (!isPlainRecord(hooks)) {
		throw new TypeError('hooks must be a plain object')
	}

	const phaseSet = new Set<string>(phases)
	const declarations: Partial<Record<TPhase, ErasedHookHandler>> = {}
	let declarationCount = 0

	for (const key of Reflect.ownKeys(hooks)) {
		if (typeof key !== 'string') {
			throw new TypeError('hooks contains an unsupported symbol key')
		}

		if (!phaseSet.has(key)) {
			throw new TypeError(`Unknown ${scope} hook: hooks.${key}`)
		}

		const handler: unknown = hooks[key]

		if (typeof handler !== 'function') {
			throw new TypeError(`hooks.${key} must be a function`)
		}

		// Runtime narrows the validated phase before invoking the original identity.
		declarations[key as TPhase] = handler as ErasedHookHandler
		declarationCount += 1
	}

	return declarationCount === 0 ? undefined : immutableRecord(declarations)
}
