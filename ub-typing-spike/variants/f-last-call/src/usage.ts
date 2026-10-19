import { Todo } from './todo.ts'
import { User } from './user.ts'

type Equal<A, B> = (<X>() => X extends A ? 1 : 2) extends <X>() => X extends B ? 1 : 2 ? true : false
type Expect<T extends true> = T

export const pending = await Todo.findMany({
	where: { completed: { eq: false }, assignee: { is: { displayName: { startsWith: 'A' } } }, tags: { some: { label: { eq: 'x' } } } },
	select: { title: true, dueAt: true },
	include: { assignee: { select: { displayName: true } }, subtasks: { select: { title: true }, where: { completed: { eq: false } } } },
	orderBy: { dueAt: 'asc' },
})
type Pending = (typeof pending)[number]
export type T1 = Expect<Equal<Pending['title'], string>>
export type T2 = Expect<Equal<Pending['dueAt'], Date | null>>
export type T3 = Expect<Equal<NonNullable<Pending['assignee']>['displayName'], string>>
export type T4 = Expect<Equal<Pending['subtasks'][number]['title'], string>>
export type T5 = Expect<Equal<keyof Pending, 'id' | 'title' | 'dueAt' | 'assignee' | 'subtasks'>>

export const users = await User.findMany({ include: { assignedTodos: { include: { assignee: { include: { roles: true } } } } } })
type U = (typeof users)[number]
export type T6 = Expect<Equal<NonNullable<U['assignedTodos'][number]['assignee']>['roles'][number]['name'], string>>
export type T7 = Expect<Equal<U['email'], string>>

export const created = await Todo.createOne({ data: { title: 'x', completed: false, archived: false, isDeleted: false, acl: null as never, assignee: { connect: 'u1' } } })
export type T8 = Expect<Equal<(typeof created)['priority'], 'low' | 'normal' | 'high' | null>>

// @ts-expect-error unknown field in where
await Todo.findMany({ where: { titel: { eq: 'x' } } })
// @ts-expect-error unknown field in an included target select
await Todo.findMany({ include: { assignee: { select: { nickname: true } } } })
// @ts-expect-error unknown field inside a relation filter
await User.findMany({ where: { assignedTodos: { some: { done: { eq: true } } } } })
// @ts-expect-error wrong value type
await Todo.findMany({ where: { completed: { eq: 'yes' } } })
// @ts-expect-error missing required field on create
await Todo.createOne({ data: { completed: false } })
