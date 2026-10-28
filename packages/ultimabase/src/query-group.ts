// `groupBy`'s arguments and result (D-146): `orderBy` names the fields of
// `by` or an aggregate, and each group has the keys the arguments ask for.
import type {
	Aggregated,
	AggregateArgs,
	Aggregates,
	KeysWith,
	Summed,
} from './query-aggregate.ts'
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

export type GroupByArgs<
	F,
	N,
	B extends GroupField<F, N> = GroupField<F, N>,
> = AggregateArgs<F> & {
	readonly by: readonly [B, ...B[]]
	readonly orderBy?:
		GroupOrderBy<F, N, B> | readonly GroupOrderBy<F, N, B>[] | undefined
	readonly skip?: number | undefined
	readonly take?: number | undefined
}

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
