// `groupBy`'s arguments and result (D-146): `having` (D-149) and `orderBy`
// name the fields of `by` or an aggregate, and each group has the keys the
// arguments ask for.
import type {
	Aggregated,
	AggregateArgs,
	Aggregates,
	DecimalKeys,
	IsDecimal,
	KeysWith,
	Summed,
	ValueOf,
} from './query-aggregate.ts'
import type { Exact } from './exact.ts'
import type { ScalarFilter } from './query-filter.ts'
import type { RecordOf, StoredRecord } from './record.ts'

type Direction = 'asc' | 'desc'
type Sorted<K extends PropertyKey> = {
	readonly [P in K]?: Direction | undefined
}
/** A value's sort: an optional one puts its `null`s first or last (D-149). */
export type SortOrder<V> = null extends V
	? | Direction
		| {
				readonly sort: Direction
				readonly nulls?: 'first' | 'last' | undefined
		  }
	: Direction
/** The `one` relations the row stores (D-37). */
type StoredOnes<F, N> = Exclude<
	keyof StoredRecord<F, N & string>,
	keyof RecordOf<F>
>
/** What a group takes: a scalar an aggregate takes, or a stored relation. */
export type GroupField<F, N> = Aggregated<F> | StoredOnes<F, N>

type GroupOrderBy<F, N, B extends PropertyKey> = {
	readonly [K in B]?: SortOrder<GroupValue<F, N, K>> | undefined
} & {
	readonly _count?:
		| Direction
		| ({ readonly _all?: Direction | undefined } & Sorted<Aggregated<F>>)
		| undefined
	readonly _sum?: Sorted<Summed<F>> | undefined
	readonly _avg?: Sorted<Summed<F>> | undefined
	readonly _min?: Sorted<KeysWith<F, number | string | Date>> | undefined
	readonly _max?: Sorted<KeysWith<F, number | string | Date>> | undefined
}

/** A value's filter: an id's has no `mode`, a decimal's compares (D-145). */
type ValueFilter<F, K> = K extends 'id'
	? Omit<ScalarFilter<string>, 'mode'>
	: ScalarFilter<ValueOf<F, K>, K extends keyof F ? IsDecimal<F[K]> : false>
type Filtered<V, Decimal = false> = V | ScalarFilter<V, Decimal> | undefined

/** Field `K`'s aggregates, each filtered as the value it gives (D-149). */
type AggregateFilters<F, K> = {
	readonly _count?: Filtered<number>
} & (K extends Summed<F>
	? {
			readonly _sum?: K extends DecimalKeys<F>
				? Filtered<string, true>
				: Filtered<number>
			readonly _avg?: Filtered<number>
		}
	: unknown) &
	(K extends KeysWith<F, number | string | Date>
		? {
				readonly _min?: ValueOf<F, K> | ValueFilter<F, K> | undefined
				readonly _max?: ValueOf<F, K> | ValueFilter<F, K> | undefined
			}
		: unknown)

/** The groups kept: a field of `by` by its value, any field by its aggregates. */
type Having<F, N, B extends PropertyKey> = {
	readonly [K in Aggregated<F>]?:
		| (K extends B
				? GroupValue<F, N, K> | (ValueFilter<F, K> & AggregateFilters<F, K>)
				: AggregateFilters<F, K>)
		| undefined
} & {
	readonly AND?: Having<F, N, B> | readonly Having<F, N, B>[] | undefined
	readonly OR?: readonly Having<F, N, B>[] | undefined
	readonly NOT?: Having<F, N, B> | readonly Having<F, N, B>[] | undefined
}

export type GroupByArgs<
	F,
	N,
	B extends GroupField<F, N> = GroupField<F, N>,
> = AggregateArgs<F> & {
	readonly by: readonly [B, ...B[]]
	readonly having?: Having<F, N, B> | undefined
	readonly orderBy?:
		GroupOrderBy<F, N, B> | readonly GroupOrderBy<F, N, B>[] | undefined
	readonly skip?: number | undefined
	readonly take?: number | undefined
}

/**
 * Arguments `A`, checked against the fields of their `by`: no unknown key,
 * and a `having` that fits them, which `Exact` does not check as it skips
 * values: a value for a field outside `by` would pass.
 */
export type GroupChecked<
	F,
	N,
	A extends { readonly by: readonly unknown[] },
> = Exact<A, GroupByArgs<F, N, A['by'][number] & GroupField<F, N>>> &
	(A extends { readonly having: infer H }
		? [H] extends [Having<F, N, A['by'][number] & PropertyKey> | undefined]
			? unknown
			: {
					readonly having: {
						readonly error: 'a field outside by takes aggregates only'
					}
				}
		: unknown)

/** A relation's target id, `null` when unset or unreadable (D-86). */
type GroupValue<F, N, K> =
	K extends StoredOnes<F, N>
		? { readonly id: string } | null
		: K extends keyof StoredRecord<F, N & string>
			? StoredRecord<F, N & string>[K]
			: never

/** What `groupBy` returns for the arguments `A`. */
export type Groups<F, N, A> = A extends {
	readonly by: readonly (infer B)[]
}
	? ({ readonly [K in B & PropertyKey]: GroupValue<F, N, K> } & Aggregates<
			F,
			A
		>)[]
	: never
