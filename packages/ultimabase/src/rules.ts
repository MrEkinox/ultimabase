// What every access rule receives, and the kernel's ready-made rules (D-10).
import { PublicError } from './errors.ts'
import type { ReadRecord } from './read-row.ts'
import type { RecordOf } from './record.ts'
import type { modelFields, openRead } from './symbols.ts'

export type Operation = 'read' | 'create' | 'update' | 'delete'

/**
 * The application declares its user model here, once; without it,
 * `caller.user` is `{ id }` (D-24, D-62).
 */
export interface Register {}

/** The user record a registry gives `caller.user`. */
export type UserOf<R> = R extends {
	readonly user: { readonly [modelFields]: infer F }
}
	? RecordOf<F>
	: { readonly id: string }

/**
 * The registered user model's row as a read gives it: a field a read rule
 * may hide is optional (D-199, D-203).
 */
export type UserRowOf<R> = R extends {
	readonly user: { readonly [modelFields]: infer F }
}
	? ReadRecord<F>
	: { readonly id: string }

/** `viewer` on the filter of a relation to `Register`'s user model (D-189). */
export type ViewerFilter<T> = T extends () => { readonly name: infer N }
	? Register extends { readonly user: { readonly name: N } }
		? { readonly viewer?: boolean | undefined }
		: unknown
	: unknown

/**
 * The keys plugins add to a user caller, each plugin declaring its own
 * (D-121): `declare module 'ultimabase' { interface UserCallerKeys { ... } }`.
 */
export interface UserCallerKeys {}

type Master = {
	readonly kind: 'master'
	readonly master: { readonly source: 'code' | 'key' }
}

/**
 * Who code says sends an operation, as `as` and a plugin's `identify` give
 * it: a user caller without the keys plugins add (D-121).
 */
export type Identity =
	| { readonly kind: 'anonymous' }
	| { readonly kind: 'user'; readonly user: UserOf<Register> }
	| Master

/** Who sends an operation, as rules, hooks and functions see it (D-19). */
export type Caller =
	| { readonly kind: 'anonymous' }
	| ({
			readonly kind: 'user'
			readonly user: UserOf<Register>
	  } & UserCallerKeys)
	| Master

const masters = new WeakSet<object>()

/** A Master caller; the kernel's code and transports only (D-19, D-49). */
export function createMaster(source: 'code' | 'key'): Master {
	const caller: Master = Object.freeze({
		kind: 'master',
		master: Object.freeze({ source }),
	})
	masters.add(caller)
	return caller
}

/** Whether a caller is a Master the kernel created. */
export function isMaster(caller: object): caller is Master {
	return masters.has(caller)
}

/** Server code acting with every right; only the kernel creates it. */
export const master: Master = createMaster('code')

/** A rule that reads only the caller and the operation fits any access key. */
export type AnyRule = (facts: {
	readonly caller: Caller
	readonly operation: Operation
}) => boolean

/** A rule that reads only the caller also fits a function's access (D-27). */
export type CallerRule = (facts: { readonly caller: Caller }) => boolean

/** A rule every caller reads through, which hides no field (D-176). */
export type OpenRule<R> = R & { readonly [openRead]: true }

type Allow = {
	readonly public: OpenRule<CallerRule>
	readonly readOnly: OpenRule<AnyRule>
	readonly private: CallerRule
}

const open = <R extends object>(rule: R): OpenRule<R> =>
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the mark is a type only; the kernel tells these rules by identity (D-176).
	rule as unknown as OpenRule<R>

/** Open to everyone, open to reads, closed to everyone but Master (D-10). */
export const allow: Allow = Object.freeze({
	public: open<CallerRule>(() => true),
	readOnly: open<AnyRule>(({ operation }) => operation === 'read'),
	private: () => false,
})

/** One `where` of a filter, and the error a written row outside it throws. */
export type FilterPart = {
	readonly where: unknown
	readonly error?: PublicError
}

const filters = new WeakMap<object, readonly FilterPart[]>()

function token(parts: readonly FilterPart[]): object {
	const made = Object.freeze({})
	filters.set(made, parts)
	return made
}

/** The read filter a read rule's `where` returns (D-10). */
export function readFilter(where: unknown): object {
	return token([{ where }])
}

/** The filter a write rule's `where` returns, with its error (D-214). */
export function writeFilter(where: unknown, error?: unknown): object {
	if (error === undefined) return readFilter(where)
	if (!(error instanceof PublicError)) {
		throw new TypeError("A write rule's where takes a PublicError.")
	}
	return token([{ where, error }])
}

/** Whether a rule's result is a read filter. */
export function isReadFilter(value: unknown): value is object {
	return typeof value === 'object' && value !== null && filters.has(value)
}

/** The `where`s a filter holds, each checked alone in a write (D-214). */
export function partsOf(filter: object): readonly FilterPart[] {
	return filters.get(filter) ?? []
}

/** The `where` a read filter holds: all its parts. */
export function filterOf(filter: object): unknown {
	const parts = partsOf(filter).map(({ where }) => where)
	return parts.length === 1 ? parts[0] : { AND: parts }
}

type Results = { readonly decided: boolean; readonly filters: object[] }

// A rule returns a boolean or a filter (D-76, D-81, D-214).
function collect(
	rules: readonly Rule[],
	facts: unknown,
	decisive: boolean,
): Results {
	const found: object[] = []
	for (const rule of rules) {
		const result: unknown = Reflect.apply(rule, undefined, [facts])
		if (result === decisive) return { decided: true, filters: [] }
		if (isReadFilter(result)) found.push(result)
		else if (typeof result !== 'boolean') {
			throw new TypeError('A rule returns a boolean or a filter.')
		}
	}
	return { decided: false, filters: found }
}

// `allOf` keeps each filter with its error; `anyOf` joins them, losing
// theirs (D-214).
function combine(
	rules: readonly Rule[],
	decisive: boolean,
): (facts: unknown) => unknown {
	return (facts) => {
		const { decided, filters: found } = collect(rules, facts, decisive)
		if (decided) return decisive
		const [first, ...others] = found
		if (first === undefined) return !decisive
		if (others.length === 0) return first
		if (!decisive) return token(found.flatMap(partsOf))
		return readFilter({ OR: found.map(filterOf) })
	}
}
type Rule = (facts: never) => unknown

/** A rule already typed, such as a `const` holding `signedIn(...)`. */
type Named = (facts: never) => unknown
type Both<U> = (U extends unknown ? (u: U) => void : never) extends (
	u: infer I,
) => void
	? I
	: never
/** The rule combining named rules: it needs every rule's facts. */
type Combined<Rules extends readonly Named[]> = (
	facts: Both<Parameters<Rules[number]>[0]>,
) => ReturnType<Rules[number]>

/**
 * True when one of the rules is (D-10). The facts and the result come from
 * where it is used, never from the rules, so each rule is typed by its place.
 * Their filters combine with `OR` (D-81): `true` from any rule lets every
 * row through, `false` adds nothing; a written row outside them is
 * `ACCESS_DENIED`, their errors lost (D-214).
 */
export function anyOf<Facts, R = boolean>(
	...rules: readonly NoInfer<(facts: Facts) => R>[]
): (facts: Facts) => R
/** Outside any place, the facts are those every rule needs. */
export function anyOf<const Rules extends readonly Named[]>(
	...rules: Rules
): Combined<Rules>
export function anyOf(...rules: readonly Rule[]): (facts: never) => unknown {
	return combine(rules, true)
}

/**
 * True when every rule is (D-81), typed as `anyOf`. Their filters combine
 * with `AND`: `false` from any rule hides every row, `true` adds nothing; a
 * written row is checked against each filter, with its own error (D-214).
 */
export function allOf<Facts, R = boolean>(
	...rules: readonly NoInfer<(facts: Facts) => R>[]
): (facts: Facts) => R
export function allOf<const Rules extends readonly Named[]>(
	...rules: Rules
): Combined<Rules>
export function allOf(...rules: readonly Rule[]): (facts: never) => unknown {
	return combine(rules, false)
}
