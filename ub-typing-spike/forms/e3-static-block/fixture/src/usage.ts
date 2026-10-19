import type { CreateInput } from '../../lib/types.ts'
import { Tag } from './tag.ts'
import { TodoRole } from './todo-role.ts'
import { TodoUser } from './todo-user.ts'
import { Todo } from './todo.ts'

type Equal<A, B> = (<X>() => X extends A ? 1 : 2) extends <X>() => X extends B ? 1 : 2 ? true : false
type Expect<T extends true> = T

// Cross-schema where (Todo -> TodoUser, Todo -> Tag), select, include.
export const pending = await Todo.findMany(
	{
		where: { archived: { eq: false }, assignee: { is: { displayName: { startsWith: 'A' } } }, tags: { some: { name: { eq: 'x' } } } },
		select: { title: true, priority: true },
		include: { assignee: { select: { email: true } }, subtasks: { select: { title: true }, where: { status: { eq: 'open' } } } },
		orderBy: { title: 'asc' },
	},
	{ useMasterKey: true },
)
type Pending = (typeof pending)[number]
export type T1 = Expect<Equal<Pending['title'], string>>
export type T2 = Expect<Equal<Pending['priority'], 'low' | 'normal' | 'high' | null>>
export type T3 = Expect<Equal<NonNullable<Pending['assignee']>, { readonly id: string; readonly email: string }>>
export type T4 = Expect<Equal<Pending['subtasks'][number], { readonly id: string; readonly title: string }>>
export type T5 = Expect<Equal<keyof Pending, 'id' | 'title' | 'priority' | 'assignee' | 'subtasks'>>

export const users = await TodoUser.findMany({ include: { assignedTodos: { include: { assignee: { include: { roles: true } } } } } })
type U = (typeof users)[number]
export type T6 = Expect<Equal<NonNullable<U['assignedTodos'][number]['assignee']>['roles'][number]['name'], string>>
export type T7 = Expect<Equal<U['username'], string>>

// Create input typed from the class; the plugin field (`isDeleted`) and enum list are included.
const input: CreateInput<typeof Todo> = { title: 'x', status: 'open', isDeleted: false, acl: null as never, allowedPriorities: ['low'], assignee: { connect: 'u1' } }
export const created = await Todo.createOne({ data: input })
export type T8 = Expect<Equal<(typeof created)['allowedPriorities'], readonly ('low' | 'normal' | 'high')[] | null>>
export type T9 = Expect<Equal<(typeof created)['isDeleted'], boolean>>

// Model instance type: the class instance type is the model.
const one: Todo | null = await Todo.findOne({ where: { title: { eq: 'x' } } })
export type T10 = Expect<Equal<NonNullable<typeof one>['status'], 'open' | 'inProgress' | 'done'>>

// Plugin factory: typed signUp and role statics.
export const signedUp = await TodoUser.signUp({ displayName: 'A', username: 'a', email: 'a@x.test', password: 'secret', acl: null as never })
await TodoRole.addMember({ id: 'r1' }, signedUp)
export const tags = await Tag.findMany({ where: { todos: { some: { assignee: { is: { email: { endsWith: '@x.test' } } } } } } })

// @ts-expect-error unknown field in where
await Todo.findMany({ where: { titel: { eq: 'x' } } })
// @ts-expect-error unknown field in an included target select
await Todo.findMany({ include: { assignee: { select: { nickname: true } } } })
// @ts-expect-error unknown field inside a relation filter
await TodoUser.findMany({ where: { assignedTodos: { some: { done: { eq: true } } } } })
// @ts-expect-error wrong enum value
await Todo.findMany({ where: { status: { eq: 'closed' } } })
// @ts-expect-error missing required field on create
await Todo.createOne({ data: { archived: false } })
// @ts-expect-error signUp requires the password
await TodoUser.signUp({ displayName: 'A', username: 'a', email: 'a@x.test', acl: null as never })
// @ts-expect-error useMasterKey is a boolean
await Todo.findMany({}, { useMasterKey: 'yes' })

// Query typo used by fault 8 (probe edits `title: true` below into `titel: true`).
export const titles = await Todo.findMany({ select: { title: true } })
