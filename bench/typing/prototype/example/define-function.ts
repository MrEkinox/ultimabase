// Functions (D-27, D-45): each output form, an optional input, the access
// rule and the transports' keys. `tsc` fails if one does not hold.
import { z } from 'zod'
import type { InputOf, OutputOf, RecordOf } from '../index.ts'
import {
	master,
	allow,
	defineApp,
	defineFunction,
	defineModel,
	defineType,
	graphql,
	graphqlPlugin,
	memory,
	softDelete,
} from '../index.ts'

type Equal<A, B> =
	// oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- the test needs a free `T`
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
		? true
		: false
type Expect<T extends true> = T

const Todo = defineModel({
	name: 'Todo',
	fields: (f) => ({
		title: f.string(),
		archived: f.boolean({ default: false }),
	}),
})
type TodoRecord = RecordOf<typeof Todo>

// A model: `run` returns its record, as a query does.
export const archiveTodo = defineFunction({
	name: 'archiveTodo',
	use: [graphql()],
	input: z.object({ id: z.string() }),
	output: Todo,
	run: ({ input, caller }) =>
		Todo.update(
			{ where: { id: input.id }, data: { archived: true } },
			{ as: caller },
		),
}).with({
	access: ({ caller }) => caller.kind === 'user',
	graphql: { name: 'archive' },
})

// A list of a model; without an input, `run` receives none.
export const openTodos = defineFunction({
	name: 'openTodos',
	output: [Todo],
	run: ({ caller }) =>
		Todo.findMany({ where: { archived: false } }, { as: caller }),
}).with({ access: allow.public })

// A list paginated by its input (D-45: no `paginated(Todo)` in 0.1).
export const pagedTodos = defineFunction({
	name: 'pagedTodos',
	input: z.object({ take: z.number().int().max(100), skip: z.number().int() }),
	output: [Todo],
	run: ({ input, caller }) => Todo.findMany(input, { as: caller }),
})

// A named object mixing models and schemas (D-109).
const EnsuredTodo = defineType({
	name: 'EnsuredTodo',
	fields: { todo: Todo, created: z.boolean() },
})
export const ensureTodo = defineFunction({
	name: 'ensureTodo',
	input: z.object({ title: z.string().trim().min(1) }),
	output: EnsuredTodo,
	run: async ({ input, caller }) => {
		const [todo] = await Todo.findMany(
			{ where: { title: input.title }, take: 1 },
			{ as: caller },
		)
		if (todo) return { todo, created: false }
		const created = await Todo.create(
			{ data: { title: input.title } },
			{ as: caller },
		)
		return { todo: created, created: true }
	},
})

// A query; `nullable()` lets it return `null`.
export const findTodo = defineFunction({
	name: 'findTodo',
	query: true,
	input: z.object({ title: z.string() }),
	output: Todo.nullable(),
	run: ({ input, caller }) =>
		Todo.findFirst({ where: { title: input.title } }, { as: caller }),
}).with({ access: allow.public })

// Without an output, `run` returns nothing.
export const purgeTodos = defineFunction({
	name: 'purgeTodos',
	run: async ({ caller }) => {
		const archived = await Todo.findMany(
			{ where: { archived: true } },
			{ as: caller },
		)
		for (const { id } of archived) {
			await Todo.delete({ where: { id } }, { as: caller })
		}
	},
})

// Any Standard Schema; `false` hides it from a transport the function uses.
const Stats = z.object({ open: z.number(), archived: z.number() })
export const todoStats = defineFunction({
	name: 'todoStats',
	use: [graphql()],
	output: Stats,
	run: async ({ caller }) => ({
		open: await Todo.count({ where: { archived: false } }, { as: caller }),
		archived: await Todo.count({ where: { archived: true } }, { as: caller }),
	}),
}).with({ access: allow.private, graphql: false })

export type FunctionChecks = [
	Expect<Equal<OutputOf<typeof archiveTodo>, TodoRecord>>,
	Expect<Equal<OutputOf<typeof openTodos>, readonly TodoRecord[]>>,
	Expect<Equal<OutputOf<typeof pagedTodos>, readonly TodoRecord[]>>,
	Expect<
		Equal<
			OutputOf<typeof ensureTodo>,
			{ readonly todo: TodoRecord; readonly created: boolean }
		>
	>,
	Expect<Equal<OutputOf<typeof findTodo>, TodoRecord | null>>,
	Expect<Equal<OutputOf<typeof purgeTodos>, void>>,
	Expect<Equal<OutputOf<typeof todoStats>, { open: number; archived: number }>>,
	// What a caller sends, before the schema's `trim` (D-74).
	Expect<Equal<InputOf<typeof ensureTodo>, { title: string }>>,
	Expect<Equal<InputOf<typeof todoStats>, undefined>>,
]

// Server code calls a function with `run` (D-75).
const archived = await archiveTodo.run({ id: 'a' }, { as: master })
const stats = await todoStats.run({ as: master })
export const runChecks: [TodoRecord, number] = [archived, stats.open]
// @ts-expect-error: the input is checked by its schema's type.
await archiveTodo.run({ id: 1 }, { as: master })
// @ts-expect-error: a function without an input takes only the options.
await todoStats.run({ open: 1 }, { as: master })

export const app = defineApp({
	database: memory(),
	plugins: [graphqlPlugin()],
	models: [Todo],
	functions: [
		archiveTodo,
		openTodos,
		pagedTodos,
		ensureTodo,
		findTodo,
		purgeTodos,
		todoStats,
	],
})

defineFunction({
	name: 'wrongReturn',
	output: Todo,
	// @ts-expect-error: `run` returns the output's type.
	run: () => ({ title: 'a' }),
})
defineFunction({
	name: 'wrongList',
	output: [Todo],
	// @ts-expect-error: a list output returns a list.
	run: ({ caller }) => Todo.findUnique({ where: { id: 'a' } }, { as: caller }),
})
defineFunction({
	name: 'wrongNullable',
	output: Todo,
	// @ts-expect-error: `null` needs `Todo.nullable()`.
	run: () => null,
})
defineType({
	name: 'Empty',
	// @ts-expect-error: a type's field is an output, not nothing.
	fields: { nothing: undefined },
})
defineFunction({
	name: 'noInput',
	output: z.boolean(),
	// @ts-expect-error: without an input, `run` receives none.
	run: ({ input }) => typeof input === 'number',
})
defineFunction({
	name: 'anyInput',
	// @ts-expect-error: an input typed `any` would hide the input's type.
	input: z.any(),
	output: z.number(),
	run: () => 1,
})
defineFunction({
	name: 'notTransport',
	// @ts-expect-error: soft delete has no key on a function.
	use: [softDelete()],
	output: z.number(),
	run: () => 1,
})
defineFunction({ name: 'readOnly', output: z.number(), run: () => 1 }).with({
	// @ts-expect-error: `readOnly` reads the operation, which a function has not.
	access: allow.readOnly,
})
defineFunction({ name: 'unused', output: z.number(), run: () => 1 }).with({
	// @ts-expect-error: the function does not use graphql.
	graphql: false,
})
// @ts-expect-error: a function uses 'graphql', which is not in plugins.
defineApp({ database: memory(), models: [], functions: [todoStats] })
