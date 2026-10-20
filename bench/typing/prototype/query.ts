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
	readonly equals?: V | null
	readonly not?: V | null
	readonly in?: readonly V[]
	readonly notIn?: readonly V[]
} & ([V] extends [number | Date]
	? {
			readonly lt?: V
			readonly lte?: V
			readonly gt?: V
			readonly gte?: V
		}
	: unknown) &
	([V] extends [string]
		? {
				readonly contains?: string
				readonly startsWith?: string
				readonly endsWith?: string
			}
		: unknown)

type FilterOf<X> =
	KindOf<X> extends 'scalar'
		? StoredValue<X> | ScalarFilter<NonNullable<StoredValue<X>>>
		: KindOf<X> extends 'one'
			? {
					readonly is?: Where<TargetFields<TargetOf<X>>> | null
					readonly isNot?: Where<TargetFields<TargetOf<X>>> | null
				}
			: {
					readonly some?: Where<TargetFields<TargetOf<X>>>
					readonly every?: Where<TargetFields<TargetOf<X>>>
					readonly none?: Where<TargetFields<TargetOf<X>>>
				}

export type Where<F> = {
	readonly [K in keyof F]?: FilterOf<F[K]>
} & {
	readonly id?: string | ScalarFilter<string>
	readonly createdAt?: Date | ScalarFilter<Date>
	readonly updatedAt?: Date | ScalarFilter<Date>
	readonly AND?: Where<F> | readonly Where<F>[]
	readonly OR?: readonly Where<F>[]
	readonly NOT?: Where<F> | readonly Where<F>[]
}

/** `findUnique` and single-row writes target `id` or a unique field (D-52). */
export type UniqueWhere<F> =
	| { readonly id: string }
	| {
			[K in UniqueKeys<F>]: { readonly [P in K]: StoredValue<F[K]> }
	  }[UniqueKeys<F>]

type Direction = 'asc' | 'desc'
export type OrderBy<F> = {
	readonly [K in ScalarKeys<F> | keyof SystemFields]?: Direction
}

type RelationArgs<X> = {
	readonly select?: Select<TargetFields<TargetOf<X>>>
	readonly include?: Include<TargetFields<TargetOf<X>>>
} & (KindOf<X> extends 'many'
	? {
			readonly where?: Where<TargetFields<TargetOf<X>>>
			readonly orderBy?: OrderBy<TargetFields<TargetOf<X>>>
			readonly take?: number
			readonly skip?: number
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

export type FindManyArgs<F> = {
	readonly where?: Where<F>
	readonly select?: Select<F>
	readonly include?: Include<F>
	readonly orderBy?: OrderBy<F> | readonly OrderBy<F>[]
	readonly take?: number
	readonly skip?: number
}

export type FindUniqueArgs<F> = {
	readonly where: UniqueWhere<F>
	readonly select?: Select<F>
	readonly include?: Include<F>
}

export type CreateArgs<F> = {
	readonly data: CreateData<F>
	readonly select?: Select<F>
	readonly include?: Include<F>
}

export type UpdateArgs<F> = {
	readonly where: UniqueWhere<F>
	readonly data: UpdateData<F>
	readonly select?: Select<F>
	readonly include?: Include<F>
}

/** Model methods (D-18), the subset the prototype measures. */
export interface Queries<F> {
	findMany<const A extends FindManyArgs<F>>(
		args?: A & NoInfer<Exact<A, FindManyArgs<F>>>,
		options?: QueryOptions,
	): Promise<Payload<F, A>[]>
	findUnique<const A extends FindUniqueArgs<F>>(
		args: A & NoInfer<Exact<A, FindUniqueArgs<F>>>,
		options?: QueryOptions,
	): Promise<Payload<F, A> | null>
	count(
		args?: { readonly where?: Where<F> },
		options?: QueryOptions,
	): Promise<number>
	create<const A extends CreateArgs<F>>(
		args: A & NoInfer<Exact<A, CreateArgs<F>>>,
		options?: QueryOptions,
	): Promise<Payload<F, A>>
	update<const A extends UpdateArgs<F>>(
		args: A & NoInfer<Exact<A, UpdateArgs<F>>>,
		options?: QueryOptions,
	): Promise<Payload<F, A>>
	delete(
		args: { readonly where: UniqueWhere<F> },
		options?: QueryOptions,
	): Promise<RecordOf<F>>
}
