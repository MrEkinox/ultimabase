// The writes of many rows, all or nothing: `createMany` (D-135),
// `updateMany` (D-133), `deleteMany` (D-111), and the forms that return the
// rows they write (D-149).
import type { Exact } from './exact.ts'
import type { Payload, QueryOptions, Shaping, Where } from './query.ts'
import type { CreateManyData, UpdateManyData } from './record.ts'

/** `createMany`: a row or a list, no nested writes, no rows back (D-135). */
export type CreateManyArgs<F> = {
	readonly data: CreateManyData<F> | readonly CreateManyData<F>[]
}

/** `updateMany`: no relation writes, no returned rows (D-133). */
export type UpdateManyArgs<F> = {
	readonly where?: Where<F> | undefined
	readonly data: UpdateManyData<F>
}

export type CreateManyAndReturnArgs<F> = CreateManyArgs<F> & Shaping<F>
export type UpdateManyAndReturnArgs<F> = UpdateManyArgs<F> & Shaping<F>

export interface BulkQueries<F> {
	/** A create of each row of `data`, all or nothing (D-135). */
	createMany(
		this: void,
		args: CreateManyArgs<F>,
		options?: QueryOptions,
	): Promise<{ readonly count: number }>
	/** An update of each row `where` selects, all or nothing (D-133). */
	updateMany(
		this: void,
		args: UpdateManyArgs<F>,
		options?: QueryOptions,
	): Promise<{ readonly count: number }>
	/** A delete of each row `where` selects, all or nothing (D-111). */
	deleteMany(
		this: void,
		args?: { readonly where?: Where<F> | undefined },
		options?: QueryOptions,
	): Promise<{ readonly count: number }>
	/** `createMany`'s rows, in `data`'s order, each as `create` returns it. */
	createManyAndReturn<const A extends CreateManyAndReturnArgs<F>>(
		this: void,
		args: A & NoInfer<Exact<A, CreateManyAndReturnArgs<F>>>,
		options?: QueryOptions,
	): Promise<Payload<F, A>[]>
	/** `updateMany`'s rows, in `id` order, each as `update` returns it. */
	updateManyAndReturn<const A extends UpdateManyAndReturnArgs<F>>(
		this: void,
		args: A & NoInfer<Exact<A, UpdateManyAndReturnArgs<F>>>,
		options?: QueryOptions,
	): Promise<Payload<F, A>[]>
}
