import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
	type MaybePromise,
} from '@ultimabase/shared'

/** Erases callback variance only after the public declaration has been type-checked. */
export type ErasedHookHandler = (input: never) => MaybePromise<unknown>

export type HookSpecificityOrder = 'broad-first' | 'specific-first'

/** Describes the optional family branches accepted by one broad hook phase. */
export interface HookPhaseDescriptor<TVariant extends string = string> {
	readonly order: HookSpecificityOrder
	readonly variants: readonly TVariant[]
}

/** Stores precomposed handler sequences so execution never rebuilds family order. */
export interface NormalizedHookPhase {
	readonly all: readonly ErasedHookHandler[]
	readonly variants: Readonly<Record<string, readonly ErasedHookHandler[]>>
}

/** Retains a sparse immutable phase map for Runtime-owned composition. */
export type NormalizedHookDeclarations<TPhase extends string> = Readonly<
	Partial<Record<TPhase, NormalizedHookPhase>>
>

interface HookDeclarationNormalizationOptions<TPhase extends string> {
	readonly descriptors?: Readonly<Partial<Record<TPhase, HookPhaseDescriptor>>>
	readonly hooks: unknown
	readonly phases: readonly TPhase[]
	readonly scope: string
}

const emptyHookHandlers: readonly ErasedHookHandler[] = immutableArray([])
const emptyHookVariants: Readonly<
	Record<string, readonly ErasedHookHandler[]>
> = immutableRecord({})

const isErasedHookHandler = (value: unknown): value is ErasedHookHandler =>
	typeof value === 'function'

/** Copies one direct handler or ordered list while preserving callback identity. */
const normalizeHookHandlerList = (
	value: unknown,
	path: string,
): readonly ErasedHookHandler[] => {
	if (isErasedHookHandler(value)) {
		return immutableArray([value])
	}

	if (!isUnknownArray(value) || value.length === 0) {
		throw new TypeError(`${path} must be a function or non-empty handler list`)
	}

	const handlers: ErasedHookHandler[] = []

	for (const [index, handler] of value.entries()) {
		if (!isErasedHookHandler(handler)) {
			throw new TypeError(`${path}[${String(index)}] must be a function`)
		}

		handlers.push(handler)
	}

	return immutableArray(handlers)
}

const combineHandlerLists = (
	all: readonly ErasedHookHandler[],
	specific: readonly ErasedHookHandler[],
	order: HookSpecificityOrder,
): readonly ErasedHookHandler[] =>
	order === 'broad-first'
		? immutableArray([...all, ...specific])
		: immutableArray([...specific, ...all])

const normalizeFamilyHookPhase = (
	value: Readonly<Record<string, unknown>>,
	descriptor: HookPhaseDescriptor,
	path: string,
): NormalizedHookPhase => {
	const allowedBranches = new Set<string>(['all', ...descriptor.variants])
	const declaredBranches = Reflect.ownKeys(value)

	if (declaredBranches.length === 0) {
		throw new TypeError(`${path} family map must not be empty`)
	}

	for (const key of declaredBranches) {
		if (typeof key !== 'string') {
			throw new TypeError(`${path} contains an unsupported symbol key`)
		}

		if (!allowedBranches.has(key)) {
			throw new TypeError(`Unknown hook family branch: ${path}.${key}`)
		}
	}

	const all = Object.hasOwn(value, 'all')
		? normalizeHookHandlerList(value.all, `${path}.all`)
		: emptyHookHandlers
	const variants: Record<string, readonly ErasedHookHandler[]> = {}

	for (const variant of descriptor.variants) {
		if (!Object.hasOwn(value, variant)) {
			continue
		}

		const specific = normalizeHookHandlerList(
			value[variant],
			`${path}.${variant}`,
		)
		variants[variant] = combineHandlerLists(all, specific, descriptor.order)
	}

	return immutableRecord({
		all,
		variants: immutableRecord(variants),
	})
}

const normalizeHookPhase = (
	value: unknown,
	descriptor: HookPhaseDescriptor | undefined,
	path: string,
): NormalizedHookPhase => {
	if (descriptor !== undefined && isPlainRecord(value)) {
		return normalizeFamilyHookPhase(value, descriptor, path)
	}

	return immutableRecord({
		all: normalizeHookHandlerList(value, path),
		variants: emptyHookVariants,
	})
}

/**
 * Copies declaration maps without executing callbacks or retaining caller state.
 *
 * Schema and field declarations share this boundary so their diagnostics,
 * list semantics, and family ordering cannot drift.
 */
export const normalizeHookDeclarations = <TPhase extends string>({
	descriptors,
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
	const declarations: Partial<Record<TPhase, NormalizedHookPhase>> = {}
	let declarationCount = 0

	for (const key of Reflect.ownKeys(hooks)) {
		if (typeof key !== 'string') {
			throw new TypeError('hooks contains an unsupported symbol key')
		}

		if (!phaseSet.has(key)) {
			throw new TypeError(`Unknown ${scope} hook: hooks.${key}`)
		}

		const phase = key as TPhase
		declarations[phase] = normalizeHookPhase(
			hooks[key],
			descriptors?.[phase],
			`hooks.${key}`,
		)
		declarationCount += 1
	}

	return declarationCount === 0 ? undefined : immutableRecord(declarations)
}

/** Resolves one already composed immutable sequence without allocating per operation. */
export const getHookHandlers = <TPhase extends string>(
	declarations: NormalizedHookDeclarations<TPhase> | undefined,
	phase: TPhase,
	variant?: string,
): readonly ErasedHookHandler[] => {
	const declaration = declarations?.[phase]

	if (declaration === undefined) {
		return emptyHookHandlers
	}

	return variant === undefined
		? declaration.all
		: (declaration.variants[variant] ?? declaration.all)
}
