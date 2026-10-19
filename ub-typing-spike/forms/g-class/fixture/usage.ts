import type { CreateInput } from '../lib/types.ts'
import { Todo } from './todo.ts'
import { TodoRole } from './todo-role.ts'
import { TodoUser } from './todo-user.ts'

type Equal<A, B> = (<X>() => X extends A ? 1 : 2) extends <X>() => X extends B ? 1 : 2 ? true : false
type Expect<T extends true> = T

declare const asMaster: boolean

export const pending = await Todo.findMany({
	where: { archived: { eq: false }, assignee: { is: { displayName: { startsWith: 'A' } } }, tags: { some: { name: { eq: 'x' } } } },
	select: { title: true, dueAt: true, priority: true },
	include: { assignee: { select: { displayName: true } }, subtasks: { select: { title: true }, where: { status: { eq: 'open' } } } },
	orderBy: { dueAt: 'asc' },
	useMasterKey: asMaster,
})
type Pending = (typeof pending)[number]
export type T1 = Expect<
	Equal<
		Pending,
		{
			readonly id: string
			readonly title: string
			readonly dueAt: Date | null
			readonly priority: 'low' | 'normal' | 'high' | null
			readonly assignee: { readonly id: string; readonly displayName: string } | null
			readonly subtasks: { readonly id: string; readonly title: string }[]
		}
	>
>

// Without projection, results are model instances: the class instance type is the model type.
export const one: Todo | null = await Todo.findOne({ where: { title: { eq: 'x' } } })
export const all: Todo[] = await Todo.findMany()
export type T2 = Expect<Equal<Awaited<ReturnType<typeof Todo.findOne<typeof Todo>>>, Todo | null>>
export type T3 = Expect<Equal<Todo['isDeleted'], boolean>>
export type T4 = Expect<Equal<Todo['allowedPriorities'], readonly ('low' | 'normal' | 'high')[] | null>>
export type T5 = Expect<Equal<Todo['status'], 'open' | 'inProgress' | 'done' | null>>

export const users = await TodoUser.findMany({ include: { assignedTodos: { include: { assignee: { include: { roles: true } } } } } })
type U = (typeof users)[number]
export type T6 = Expect<Equal<NonNullable<U['assignedTodos'][number]['assignee']>['roles'][number]['name'], string>>
export type T7 = Expect<Equal<U['email'], string>>

const input: CreateInput<typeof Todo> = { title: 'Write the report', isDeleted: false, assignee: { connect: 'u1' } }
export const created = await Todo.createOne({ data: input, useMasterKey: true })
export type T8 = Expect<Equal<typeof created, Todo>>

// Typed sign-up from the password user factory.
export const signedUp = await TodoUser.signUp({ displayName: 'Ada', username: 'ada', email: 'ada@x.test', password: 's3cret' })
export type T9 = Expect<Equal<typeof signedUp, TodoUser>>
await TodoRole.addMember({ id: 'r1' }, signedUp)
export const roles = await TodoRole.findMany({ select: { name: true }, include: { members: { select: { email: true } } } })
export type T10 = Expect<Equal<(typeof roles)[number]['members'][number]['email'], string>>

// @ts-expect-error unknown field in where
await Todo.findMany({ where: { titel: { eq: 'x' } } })
// @ts-expect-error unknown field in an included target select
await Todo.findMany({ include: { assignee: { select: { nickname: true } } } })
// @ts-expect-error unknown field inside a relation filter
await TodoUser.findMany({ where: { assignedTodos: { some: { done: { eq: true } } } } })
// @ts-expect-error wrong value type
await Todo.findMany({ where: { archived: { eq: 'yes' } } })
// @ts-expect-error missing required field on create
await Todo.createOne({ data: { archived: false, isDeleted: false } })
// @ts-expect-error useMasterKey is a boolean
await Todo.findMany({ useMasterKey: 'yes' })
// @ts-expect-error signUp requires the password
await TodoUser.signUp({ displayName: 'Ada', username: 'ada', email: 'ada@x.test' })
