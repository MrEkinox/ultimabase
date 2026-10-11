import {
	immutableArray,
	immutableRecord,
	isPlainRecord,
	isUnknownArray,
	type MaybePromise,
} from '@ultimabase/shared'

/** Keeps public family names and internal dispatch descriptors on one vocabulary. */
export const saveHookFamilies: readonly ['create', 'update', 'upsert'] =
	immutableArray(['create', 'update', 'upsert'])

/** Identifies one logical family without splitting singular and bulk terminals. */
export type HookOperationFamily =
	(typeof saveHookFamilies)[number] | 'delete' | 'read'

/** Lists accepted phases once so runtime validation and public diagnostics cannot drift. */
export const schemaHookPhases = [
	'resolveInput',
	'beforeOperation',
	'afterOperation',
	'afterCommit',
] as const

/** Identifies every schema phase accepted at the declaration boundary. */
export type SchemaHookPhase = (typeof schemaHookPhases)[number]

/** Names the phases that observe operations, as opposed to `resolveInput`. */
export type SchemaHookGroup = Exclude<SchemaHookPhase, 'resolveInput'>

/** Lists the native operation branches of one observing phase. */
export const operationHookFamilies: readonly [
	'create',
	'update',
	'upsert',
	'delete',
] = immutableArray(['create', 'update', 'upsert', 'delete'])

/** Lists accepted inline phases once so declaration validation cannot drift. */
export const fieldHookPhases = ['resolveInput'] as const

/** Identifies every field phase accepted at the declaration boundary. */
export type FieldHookPhase = (typeof fieldHookPhases)[number]

/** Erases callback variance only after the public declaration has been type-checked. */
export type ErasedHookHandler = (input: never) => MaybePromise<unknown>

/** Retains the stable source location of one normalized declaration occurrence. */
export interface NormalizedHookHandler {
	readonly declarationBranch: string
	readonly handler: ErasedHookHandler
	readonly handlerIndex: number
}

/** Describes the optional family branches accepted by one broad hook phase. */
export interface HookPhaseDescriptor<TVariant extends string = string> {
	readonly order: 'broad-first' | 'specific-first'
	readonly variants: readonly TVariant[]
}

/** Stores precomposed handler sequences so execution never rebuilds family order. */
export interface NormalizedHookPhase {
	readonly all: readonly NormalizedHookHandler[]
	readonly variants: Readonly<Record<string, readonly NormalizedHookHandler[]>>
}

/** Retains a sparse immutable phase map for Runtime-owned composition. */
export type NormalizedHookDeclarations<TPhase extends string> = Readonly<
	Partial<Record<TPhase, NormalizedHookPhase>>
>

/** Retains one custom logical mutation's exact observer branches. */
export type SchemaMutationHookDeclarations = Readonly<
	Partial<Record<SchemaHookGroup, NormalizedHookPhase>>
>

/** Retains only validated handlers for later internal Runtime composition. */
export type SchemaHookDeclarations =
	NormalizedHookDeclarations<SchemaHookPhase> &
		Readonly<{
			readonly mutations?: Readonly<
				Record<string, SchemaMutationHookDeclarations>
			>
		}>

/** Retains only validated handlers inside a field's private capabilities. */
export type FieldHookDeclarations = NormalizedHookDeclarations<FieldHookPhase>

const emptyHookHandlers: readonly NormalizedHookHandler[] = immutableArray([])
const emptyHookVariants: NormalizedHookPhase['variants'] = immutableRecord({})

// Only the broad input phase accepts family maps; exact phases use direct lists.
const resolveInputDescriptor: HookPhaseDescriptor = immutableRecord({
	order: 'broad-first',
	variants: saveHookFamilies,
})

// Observing phases: `all` runs before the operation's own branch (ADR-0318).
const operationGroupDescriptor: HookPhaseDescriptor = immutableRecord({
	order: 'broad-first',
	variants: operationHookFamilies,
})

const includes = <TValue extends string>(
	values: readonly TValue[],
	value: string,
): value is TValue => values.some((candidate) => candidate === value)

const isErasedHookHandler = (value: unknown): value is ErasedHookHandler =>
	typeof value === 'function'

/** Copies one direct handler or ordered list while preserving callback identity. */
const normalizeHandlerList = (
	value: unknown,
	path: string,
	declarationBranch: string,
): readonly NormalizedHookHandler[] => {
	const handlers = isErasedHookHandler(value) ? [value] : value

	if (!isUnknownArray(handlers) || handlers.length === 0) {
		throw new TypeError(`${path} must be a function or non-empty handler list`)
	}

	// Array.from visits holes, so sparse lists fail at the missing position.
	return immutableArray(
		Array.from(handlers, (handler, handlerIndex) => {
			if (!isErasedHookHandler(handler)) {
				throw new TypeError(
					`${path}[${String(handlerIndex)}] must be a function`,
				)
			}
			return immutableRecord({ declarationBranch, handler, handlerIndex })
		}),
	)
}

const normalizePhase = (
	value: unknown,
	descriptor: HookPhaseDescriptor | undefined,
	path: string,
): NormalizedHookPhase => {
	if (descriptor === undefined || !isPlainRecord(value)) {
		return immutableRecord({
			all: normalizeHandlerList(value, path, 'direct'),
			variants: emptyHookVariants,
		})
	}

	const branches = Reflect.ownKeys(value)
	if (branches.length === 0) {
		throw new TypeError(`${path} family map must not be empty`)
	}
	for (const key of branches) {
		if (typeof key !== 'string') {
			throw new TypeError(`${path} contains an unsupported symbol key`)
		}
		if (key !== 'all' && !descriptor.variants.includes(key)) {
			throw new TypeError(`Unknown hook family branch: ${path}.${key}`)
		}
	}

	const all = Object.hasOwn(value, 'all')
		? normalizeHandlerList(value.all, `${path}.all`, 'all')
		: emptyHookHandlers
	const variants: Record<string, readonly NormalizedHookHandler[]> = {}

	for (const variant of descriptor.variants) {
		if (!Object.hasOwn(value, variant)) continue
		const specific = normalizeHandlerList(
			value[variant],
			`${path}.${variant}`,
			variant,
		)
		variants[variant] = immutableArray(
			descriptor.order === 'broad-first'
				? [...all, ...specific]
				: [...specific, ...all],
		)
	}

	return immutableRecord({ all, variants: immutableRecord(variants) })
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
	paths,
	phases,
	scope,
}: Readonly<{
	descriptors?: Readonly<Partial<Record<TPhase, HookPhaseDescriptor>>>
	hooks: unknown
	paths?: Readonly<Partial<Record<TPhase, string>>>
	phases: readonly TPhase[]
	scope: string
}>): NormalizedHookDeclarations<TPhase> | undefined => {
	if (hooks === undefined) return undefined
	if (!isPlainRecord(hooks)) {
		throw new TypeError('hooks must be a plain object')
	}

	const declarations: Partial<Record<TPhase, NormalizedHookPhase>> = {}

	for (const key of Reflect.ownKeys(hooks)) {
		if (typeof key !== 'string') {
			throw new TypeError('hooks contains an unsupported symbol key')
		}
		if (!includes(phases, key)) {
			throw new TypeError(`Unknown ${scope} hook: hooks.${key}`)
		}
		declarations[key] = normalizePhase(
			hooks[key],
			descriptors?.[key],
			paths?.[key] ?? `hooks.${key}`,
		)
	}

	return Object.keys(declarations).length === 0
		? undefined
		: immutableRecord(declarations)
}

/** Resolves one composed sequence with stable declaration identities. */
export const getHookHandlerEntries = <TPhase extends string>(
	declarations: NormalizedHookDeclarations<TPhase> | undefined,
	phase: TPhase,
	variant?: string,
): readonly NormalizedHookHandler[] => {
	const declaration = declarations?.[phase]
	if (declaration === undefined) return emptyHookHandlers
	return variant === undefined
		? declaration.all
		: (declaration.variants[variant] ?? declaration.all)
}

/** Copies and validates one field hook declaration without executing handlers. */
export const normalizeFieldHookDeclarations = (
	hooks: unknown,
): FieldHookDeclarations | undefined =>
	normalizeHookDeclarations({
		descriptors: { resolveInput: resolveInputDescriptor },
		hooks,
		phases: fieldHookPhases,
		scope: 'field',
	})

const schemaHookGroups: readonly SchemaHookGroup[] = immutableArray([
	'beforeOperation',
	'afterOperation',
	'afterCommit',
])

const isSchemaHookGroup = (key: string): key is SchemaHookGroup =>
	includes(schemaHookGroups, key)

const nativeBranches: ReadonlySet<string> = new Set([
	'all',
	...operationHookFamilies,
])

/**
 * Copies and validates one schema or global hook declaration without
 * attaching it.
 *
 * Native branches (`all`, `create`, `update`, `upsert`, `delete`) are grouped
 * per phase so `all` runs before the operation's own branch; other identifier
 * branches name custom schema mutations, which the contribution plan checks
 * against the application catalog. Global declarations accept none.
 */
const normalizeGroupedHookDeclarations = (
	hooks: unknown,
	scope: 'global' | 'schema',
): SchemaHookDeclarations | undefined => {
	if (hooks === undefined) return undefined
	if (!isPlainRecord(hooks)) {
		throw new TypeError('hooks must be a plain object')
	}

	const native: Record<string, unknown> = {}
	const paths: Partial<Record<SchemaHookPhase, string>> = {}
	const mutations = new Map<string, Partial<Record<SchemaHookGroup, unknown>>>()

	for (const key of Reflect.ownKeys(hooks)) {
		if (typeof key !== 'string') {
			throw new TypeError('hooks contains an unsupported symbol key')
		}
		if (key === 'resolveInput') {
			native.resolveInput = hooks.resolveInput
			paths.resolveInput = 'hooks.resolveInput'
			continue
		}
		if (!isSchemaHookGroup(key)) {
			throw new TypeError(`Unknown ${scope} hook: hooks.${key}`)
		}

		const group = hooks[key]
		if (!isPlainRecord(group)) {
			throw new TypeError(`hooks.${key} must be a plain object`)
		}
		const branches = Reflect.ownKeys(group)
		if (branches.length === 0) {
			throw new TypeError(`hooks.${key} must not be empty`)
		}

		const nativeGroup: Record<string, unknown> = {}
		for (const branch of branches) {
			if (typeof branch !== 'string') {
				throw new TypeError(`hooks.${key} contains an unsupported symbol key`)
			}
			if (nativeBranches.has(branch)) {
				nativeGroup[branch] = group[branch]
				continue
			}
			if (scope === 'global' || !/^[_A-Za-z][_0-9A-Za-z]*$/u.test(branch)) {
				throw new TypeError(`Unknown ${scope} hook: hooks.${key}.${branch}`)
			}
			mutations.set(branch, { ...mutations.get(branch), [key]: group[branch] })
		}
		if (Object.keys(nativeGroup).length > 0) {
			native[key] = nativeGroup
			paths[key] = `hooks.${key}`
		}
	}

	const declarations = normalizeHookDeclarations({
		descriptors: {
			afterCommit: operationGroupDescriptor,
			afterOperation: operationGroupDescriptor,
			beforeOperation: operationGroupDescriptor,
			resolveInput: resolveInputDescriptor,
		},
		hooks: native,
		paths,
		phases: schemaHookPhases,
		scope,
	})
	const normalizedMutations = Object.fromEntries(
		Array.from(mutations, ([command, groups]) => [
			command,
			immutableRecord(
				Object.fromEntries(
					schemaHookGroups.flatMap((group) =>
						groups[group] === undefined
							? []
							: [
									[
										group,
										normalizePhase(
											groups[group],
											undefined,
											`hooks.${group}.${command}`,
										),
									],
								],
					),
				),
			),
		]),
	)

	if (declarations === undefined && mutations.size === 0) return undefined

	return immutableRecord({
		...declarations,
		...(mutations.size === 0
			? {}
			: { mutations: immutableRecord(normalizedMutations) }),
	})
}

/** Copies and validates one schema hook declaration without attaching it. */
export const normalizeSchemaHookDeclarations = (
	hooks: unknown,
): SchemaHookDeclarations | undefined =>
	normalizeGroupedHookDeclarations(hooks, 'schema')

/** Copies and validates the application's global hooks (ADR-0318). */
export const normalizeGlobalHookDeclarations = (
	hooks: unknown,
): SchemaHookDeclarations | undefined =>
	normalizeGroupedHookDeclarations(hooks, 'global')
