import { Todo } from './todo.ts'
import { TodoRole } from './todo-role.ts'
import { TodoUser } from './todo-user.ts'
import type { CreateInput } from '../../lib/types.ts'

type Equal<A, B> = (<X>() => X extends A ? 1 : 2) extends <X>() => X extends B ? 1 : 2 ? true : false
type Expect<T extends true> = T

export const pending = await Todo.findMany({
	where: { archived: { eq: false }, assignee: { is: { displayName: { startsWith: 'A' } } }, tags: { some: { name: { eq: 'x' } } } },
	select: { title: true, dueAt: true, priority: true },
	include: { assignee: { select: { displayName: true } }, subtasks: { select: { title: true }, where: { isDeleted: { eq: false } } } },
	orderBy: { dueAt: 'asc' },
})
type Pending = (typeof pending)[number]
export type T1 = Expect<Equal<Pending['title'], string>>
export type T2 = Expect<Equal<Pending['dueAt'], Date | null>>
export type T3 = Expect<Equal<NonNullable<Pending['assignee']>['displayName'], string>>
export type T4 = Expect<Equal<Pending['subtasks'][number]['title'], string>>
export type T5 = Expect<Equal<keyof Pending, 'id' | 'title' | 'dueAt' | 'priority' | 'assignee' | 'subtasks'>>
export type T6 = Expect<Equal<Pending['priority'], 'low' | 'normal' | 'high' | null>>

export const users = await TodoUser.findMany({ include: { assignedTodos: { include: { assignee: true } } } }, { useMasterKey: true })
type U = (typeof users)[number]
export type T7 = Expect<Equal<U['email'], string>>
export type T8 = Expect<Equal<U['assignedTodos'][number]['status'], 'todo' | 'doing' | 'done'>>
export type T9 = Expect<Equal<U['assignedTodos'][number]['allowedPriorities'], readonly ('low' | 'normal' | 'high')[] | null>>

const input: CreateInput<typeof Todo> = { title: 'x', archived: false, status: 'todo', isDeleted: false, acl: null as never, assignee: { connect: 'u1' } }
export const created = await Todo.createOne({ data: input }, { useMasterKey: false })
export type T10 = Expect<Equal<(typeof created)['isDeleted'], boolean>>

export const signedUp = await TodoUser.signUp({ displayName: 'A', username: 'a', email: 'a@x.test', password: 'secret', acl: null as never })
await TodoRole.addMember({ id: 'r1' }, signedUp)
export const roles = await TodoRole.findMany({ select: { name: true }, include: { members: { select: { email: true } } } })
export type T11 = Expect<Equal<(typeof roles)[number]['members'][number]['email'], string>>

export const titles = await Todo.findMany({ select: { title: true } })
export type T12 = Expect<Equal<keyof (typeof titles)[number], 'id' | 'title'>>

// @ts-expect-error unknown field in where
await Todo.findMany({ where: { titel: { eq: 'x' } } })
// @ts-expect-error unknown field in an included target select
await Todo.findMany({ include: { assignee: { select: { nickname: true } } } })
// @ts-expect-error unknown field inside a relation filter
await TodoUser.findMany({ where: { assignedTodos: { some: { done: { eq: true } } } } })
// @ts-expect-error wrong enum value
await Todo.findMany({ where: { status: { eq: 'blocked' } } })
// @ts-expect-error missing required field on create
await Todo.createOne({ data: { archived: false } })
// @ts-expect-error signUp requires the password
await TodoUser.signUp({ displayName: 'A', username: 'a', email: 'a@x.test', acl: null as never })
// @ts-expect-error useMasterKey is a boolean
await Todo.findMany({}, { useMasterKey: 'yes' })
