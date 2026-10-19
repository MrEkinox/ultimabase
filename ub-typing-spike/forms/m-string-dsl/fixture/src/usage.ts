import { TodoUser } from './todo-user.ts'
import { Todo } from './todo.ts'

type Equal<A, B> = (<X>() => X extends A ? 1 : 2) extends <X>() => X extends B ? 1 : 2 ? true : false
type Expect<T extends true> = T

export const pending = await Todo.findMany({
	where: { archived: { eq: false }, assignee: { is: { displayName: { startsWith: 'A' }, assignedTodos: { some: { title: { eq: 'x' } } } } }, tags: { some: { name: { eq: 'x' } } } },
	select: { title: true },
	include: { assignee: { select: { email: true }, include: { assignedTodos: { select: { title: true } } } }, subtasks: true },
})
type P = (typeof pending)[number]
export type T1 = Expect<Equal<P['title'], string>>
export type T2 = Expect<Equal<NonNullable<P['assignee']>['assignedTodos'][number], { readonly id: string; readonly title: string }>>
export type T3 = Expect<Equal<P['subtasks'][number]['archived'], boolean | null>>
export const users = await TodoUser.findMany({ include: { assignedTodos: { include: { tags: true } } } })
export type T4 = Expect<Equal<(typeof users)[number]['assignedTodos'][number]['tags'][number]['name'], string>>
// @ts-expect-error cross-schema field typo
await Todo.findMany({ where: { assignee: { is: { emial: { eq: 'x' } } } } })
