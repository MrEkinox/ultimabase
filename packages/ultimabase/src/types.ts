// A model's and a function's types, named from the model or the function
// (D-74): what application code passes to queries and gets back.
import type { ResultOf, RunArgs } from './function.ts'
import type { Model } from './model.ts'
import type {
	CreateArgs,
	CreateManyArgs,
	FindManyArgs,
	FindUniqueArgs,
	Include,
	OrderBy,
	Payload,
	Select,
	UpdateArgs,
	UpdateManyArgs,
	UpsertArgs,
	Where,
} from './query.ts'
import type { CreateData, UpdateData } from './record.ts'

type Parts<M> =
	M extends Model<infer N, infer F, infer _P, infer _W, infer X>
		? { readonly name: N; readonly fields: F; readonly unique: X }
		: never
type FieldsOf<M> = Parts<M>['fields']
type UniqueOf<M> = Parts<M>['unique']
type NameOf<M> = Parts<M>['name']

type Operations<F, X, N> = {
	readonly findMany: FindManyArgs<F, X>
	readonly findFirst: FindManyArgs<F, X>
	readonly findUnique: FindUniqueArgs<F, X>
	readonly findFirstOrThrow: FindManyArgs<F, X>
	readonly findUniqueOrThrow: FindUniqueArgs<F, X>
	readonly count: { readonly where?: Where<F> }
	readonly create: CreateArgs<F, N>
	readonly update: UpdateArgs<F, X, N>
	readonly upsert: UpsertArgs<F, X, N>
	readonly delete: FindUniqueArgs<F, X>
	readonly updateMany: UpdateManyArgs<F>
	readonly createMany: CreateManyArgs<F>
	readonly deleteMany: { readonly where?: Where<F> | undefined }
}

/** One record, as arguments `A` return it; without them, its scalars. */
export type RecordOf<M, A = {}> = Payload<FieldsOf<M>, A>
export type WhereOf<M> = Where<FieldsOf<M>>
export type IncludeOf<M> = Include<FieldsOf<M>>
export type SelectOf<M> = Select<FieldsOf<M>>
export type OrderByOf<M> = OrderBy<FieldsOf<M>>
export type CreateDataOf<M> = CreateData<FieldsOf<M>, NameOf<M>>
export type UpdateDataOf<M> = UpdateData<FieldsOf<M>, NameOf<M>>
/** The arguments of one operation of the model. */
export type ArgsOf<
	M,
	O extends keyof Operations<FieldsOf<M>, UniqueOf<M>, NameOf<M>>,
> = Operations<FieldsOf<M>, UniqueOf<M>, NameOf<M>>[O]

/** What a caller sends to a function, before validation. */
export type InputOf<Fn> = Fn extends { readonly input: infer I }
	? RunArgs<I> extends readonly [input: infer V, options?: unknown]
		? V
		: undefined
	: never
/** What a function returns. */
export type OutputOf<Fn> = Fn extends { readonly output: infer O }
	? ResultOf<O>
	: never
