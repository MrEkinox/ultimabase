// Query arguments and results, in Prisma Client's form (D-20).
import type {
	CreateData,
	RecordOf,
	RelationKeys,
	ScalarKeys,
	StoredValue,
	SystemFields,
	TargetFields,
	UniqueKeys,
	UpdateData,
} from './record.ts'
import type { Exact } from './exact.ts'
import type { Caller } from './rules.ts'
import type { fieldType } from './symbols.ts'

type KindOf<X> = X extends { readonly [fieldType]: { readonly kind: infer K } }
	? K
	: never
type TargetOf<X> = X extends {
	readonly [fieldType]: { readonly target: infer T }
}
	? T
	: never
type OptionalOne<X> = X extends {
	readonly [fieldType]: { readonly options: { readonly optional: true } }
}
	? null
	: never

type ScalarFilter<V> = {
	readonly equals?: V | null | undefined
	readonly not?: V | null | undefined
	readonly in?: readonly V[] | undefined
	readonly notIn?: readonly V[] | undefined
} & ([V] extends [number | Date]
	? {
			readonly lt?: V | undefined
			readonly lte?: V | undefined
			readonly gt?: V | undefined
			readonly gte?: V | undefined
		}
	: unknown) &
	([V] extends [string]
		? {
				readonly contains?: string | undefined
				readonly startsWith?: string | undefined
				readonly endsWith?: string | undefined
			}
		: unknown)

type FilterOf<X> =
	KindOf<X> extends 'scalar'
		? StoredValue<X> | ScalarFilter<NonNullable<StoredValue<X>>>
		: KindOf<X> extends 'one'
			? {
					readonly is?: Where<TargetFields<TargetOf<X>>> | null | undefined
					readonly isNot?: Where<TargetFields<TargetOf<X>>> | null | undefined
				}
			: {
					readonly some?: Where<TargetFields<TargetOf<X>>> | undefined
					readonly every?: Where<TargetFields<TargetOf<X>>> | undefined
					readonly none?: Where<TargetFields<TargetOf<X>>> | undefined
				}

export type Where<F> = {
	readonly [K in keyof F]?: FilterOf<F[K]> | undefined
} & {
	readonly id?: string | ScalarFilter<string> | undefined
	readonly createdAt?: Date | ScalarFilter<Date> | undefined
	readonly updatedAt?: Date | ScalarFilter<Date> | undefined
	readonly AND?: Where<F> | readonly Where<F>[] | undefined
	readonly OR?: readonly Where<F>[] | undefined
	readonly NOT?: Where<F> | readonly Where<F>[] | undefined
}

/** A unique index's value: a scalar's, or a `one` relation's target id. */
type IndexValue<X> =
	KindOf<X> extends 'one' ? string : NonNullable<StoredValue<X>>
/** A unique index, targeted flat with exactly its fields (D-52). */
type IndexTarget<F, X> = X extends readonly (infer K extends keyof F)[]
	? { readonly [P in K]: IndexValue<F[P]> }
	: never

/**
 * `findUnique` and single-row writes target `id`, a unique field or a unique
 * index, whose fields `X` lists (D-52).
 */
export type UniqueWhere<F, X = never> =
	| { readonly id: string }
	| {
			[K in UniqueKeys<F>]: { readonly [P in K]: StoredValue<F[K]> }
	  }[UniqueKeys<F>]
	| IndexTarget<F, X>

type Direction = 'asc' | 'desc'
/** A json field is not sorted: each database orders json its own way (D-94). */
type SortedKeys<F> = {
	[K in ScalarKeys<F>]: F[K] extends {
		readonly [fieldType]: { readonly json: true }
	}
		? never
		: K
}[ScalarKeys<F>]
export type OrderBy<F> = {
	readonly [K in SortedKeys<F> | keyof SystemFields]?: Direction | undefined
}

type RelationArgs<X> = {
	readonly select?: Select<TargetFields<TargetOf<X>>>
	readonly include?: Include<TargetFields<TargetOf<X>>>
} & (KindOf<X> extends 'many'
	? {
			readonly where?: Where<TargetFields<TargetOf<X>>> | undefined
			readonly orderBy?: OrderBy<TargetFields<TargetOf<X>>> | undefined
			readonly take?: number | undefined
			readonly skip?: number | undefined
			readonly cursor?: UniqueWhere<TargetFields<TargetOf<X>>> | undefined
		}
	: unknown)

export type Select<F> = {
	readonly [K in keyof SystemFields]?: boolean
} & {
	readonly [K in keyof F]?: KindOf<F[K]> extends 'scalar'
		? boolean
		: boolean | RelationArgs<F[K]>
}

/** A model without relations takes no `include`. */
export type Include<F> = [RelationKeys<F>] extends [never]
	? never
	: { readonly [K in RelationKeys<F>]?: boolean | RelationArgs<F[K]> }

type Output<X, A> =
	KindOf<X> extends 'scalar'
		? StoredValue<X>
		: KindOf<X> extends 'one'
			? Payload<TargetFields<TargetOf<X>>, A> | OptionalOne<X>
			: Payload<TargetFields<TargetOf<X>>, A>[]

type Selected<F, S> = {
	readonly [
		K in keyof S as S[K] extends false | undefined ? never : K
	]: K extends keyof F
		? Output<F[K], S[K]>
		: K extends keyof SystemFields
			? SystemFields[K]
			: never
}

type Included<F, I> = {
	readonly [
		K in keyof I as I[K] extends false | undefined ? never : K
	]: K extends keyof F ? Output<F[K], I[K]> : never
}

/** Without `select`, scalar fields return and relations do not (D-20). */
export type Payload<F, A> = A extends { readonly select: infer S }
	? Selected<F, S>
	: A extends { readonly include: infer I }
		? RecordOf<F> & Included<F, I>
		: RecordOf<F>

export type QueryOptions = { readonly as?: Caller }

/** `findMany` and `findFirst`; `cursor` starts at a unique target. */
export type FindManyArgs<F, X = never> = {
	readonly where?: Where<F> | undefined
	readonly select?: Select<F>
	readonly include?: Include<F>
	readonly orderBy?: OrderBy<F> | readonly OrderBy<F>[] | undefined
	readonly take?: number | undefined
	readonly skip?: number | undefined
	readonly cursor?: UniqueWhere<F, X> | undefined
}

export type FindUniqueArgs<F, X = never> = {
	readonly where: UniqueWhere<F, X>
	readonly select?: Select<F>
	readonly include?: Include<F>
}

export type CreateArgs<F> = {
	readonly data: CreateData<F>
	readonly select?: Select<F>
	readonly include?: Include<F>
}

export type UpdateArgs<F, X = never> = {
	readonly where: UniqueWhere<F, X>
	readonly data: UpdateData<F>
	readonly select?: Select<F>
	readonly include?: Include<F>
}

/** Model methods (D-18), the subset the prototype measures. */
// Each query is a closure on its model: it can be passed around unbound.
export interface Queries<F, X = never> {
	findMany<const A extends FindManyArgs<F, X>>(
		this: void,
		args?: A & NoInfer<Exact<A, FindManyArgs<F, X>>>,
		options?: QueryOptions,
	): Promise<Payload<F, A>[]>
	findFirst<const A extends FindManyArgs<F, X>>(
		this: void,
		args?: A & NoInfer<Exact<A, FindManyArgs<F, X>>>,
		options?: QueryOptions,
	): Promise<Payload<F, A> | null>
	findUnique<const A extends FindUniqueArgs<F, X>>(
		this: void,
		args: A & NoInfer<Exact<A, FindUniqueArgs<F, X>>>,
		options?: QueryOptions,
	): Promise<Payload<F, A> | null>
	count(
		this: void,
		args?: { readonly where?: Where<F> },
		options?: QueryOptions,
	): Promise<number>
	create<const A extends CreateArgs<F>>(
		this: void,
		args: A & NoInfer<Exact<A, CreateArgs<F>>>,
		options?: QueryOptions,
	): Promise<Payload<F, A>>
	update<const A extends UpdateArgs<F, X>>(
		this: void,
		args: A & NoInfer<Exact<A, UpdateArgs<F, X>>>,
		options?: QueryOptions,
	): Promise<Payload<F, A>>
	delete(
		this: void,
		args: { readonly where: UniqueWhere<F, X> },
		options?: QueryOptions,
	): Promise<RecordOf<F>>
	/** A delete of each row `where` selects, all or nothing (D-111). */
	deleteMany(
		this: void,
		args?: { readonly where?: Where<F> | undefined },
		options?: QueryOptions,
	): Promise<{ readonly count: number }>
}
