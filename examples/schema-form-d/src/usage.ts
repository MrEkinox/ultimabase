import type { ACLContainmentOperand } from '@ultimabase/acl-permissions-plugin'
import type {
	CreateInput,
	Item,
	Model,
	Select,
	UpdateInput,
	Where,
} from '@ultimabase/core'
import { expectTypeOf } from 'vitest'

import { Tag } from './tag.ts'
import { Todo } from './todo.ts'
import { TodoUser } from './todo-user.ts'

/** Lists visible todos of one assignee with their tags. */
export const listAssignedTodos = (email: string) =>
	Todo.findMany({
		where: { assignee: { is: { email: { eq: email } } } },
		select: { title: true },
		include: {
			tags: { select: { label: true } },
			assignee: { select: { email: true } },
		},
	})

/** Reads every todo as complete models. */
export const listTodos = () => Todo.findMany()

/** Reads one todo by title; a plain value means `eq`. */
export const findTodo = (title: string) => Todo.findOne({ where: { title } })

/** Creates one todo; nested create data connects the assignee by id. */
export const createTodo = (title: string, assigneeId: string) =>
	Todo.createOne(
		{ data: { title, assignee: { connect: assigneeId } } },
		{ useMasterKey: true },
	)

/** Lists todos shared publicly for reading, through the ACL `contains` operator. */
export const listPublicTodos = () =>
	Todo.findMany({
		where: { acl: { contains: { public: ['read'] } } },
		select: { title: true },
	})

/** Lists users with their assigned todos. */
export const listUsers = () =>
	TodoUser.findMany({
		select: { email: true },
		include: { assignedTodos: { select: { title: true } } },
	})

/** Lists tags reachable through a todo assignee (two hops). */
export const listTeamTags = () =>
	Tag.findMany({
		where: {
			todos: {
				some: { assignee: { is: { email: { endsWith: '@team.test' } } } },
			},
		},
	})

type Awaited1<TValue> = TValue extends Promise<infer TResult> ? TResult : never

// Complete results print and equal the name-keyed model.
expectTypeOf<Awaited1<ReturnType<typeof listTodos>>>().toEqualTypeOf<
	readonly Model<'Todo'>[]
>()
expectTypeOf<
	Awaited1<ReturnType<typeof findTodo>>
>().toEqualTypeOf<Model<'Todo'> | null>()
expectTypeOf<Model<typeof Todo>>().toEqualTypeOf<Model<'Todo'>>()
// Plugin shape method fields reach items and models.
expectTypeOf<Item<'Todo'>['isDeleted']>().toEqualTypeOf<boolean>()
expectTypeOf<Model<'Todo'>['title']>().toEqualTypeOf<string>()
// Name-keyed inputs.
expectTypeOf<CreateInput<'Todo'>['title']>().toEqualTypeOf<string>()
expectTypeOf<UpdateInput<'Todo'>['archived']>().toEqualTypeOf<
	boolean | undefined
>()
expectTypeOf<keyof Select<'Todo'>>().toEqualTypeOf<
	| 'acl'
	| 'archived'
	| 'assignee'
	| 'createdAt'
	| 'id'
	| 'isDeleted'
	| 'parent'
	| 'priority'
	| 'title'
	| 'updatedAt'
>()
// The ACL plugin's `contains` operator is typed by the plugin's own operand.
expectTypeOf<
	NonNullable<NonNullable<Where<'Todo'>['acl']>['contains']>
>().toEqualTypeOf<ACLContainmentOperand>()
// Cross-schema object filters and inclusions follow the thunk targets.
expectTypeOf<
	Awaited1<
		ReturnType<typeof listUsers>
	>[number]['assignedTodos'][number]['title']
>().toEqualTypeOf<string>()
expectTypeOf<
	Awaited1<
		ReturnType<typeof listAssignedTodos>
	>[number]['tags'][number]['label']
>().toEqualTypeOf<string>()
expectTypeOf<
	NonNullable<
		Awaited1<ReturnType<typeof listAssignedTodos>>[number]['assignee']
	>['email']
>().toEqualTypeOf<string>()
expectTypeOf<
	Awaited1<ReturnType<typeof createTodo>>['title']
>().toEqualTypeOf<string>()
expectTypeOf<
	Awaited1<ReturnType<typeof listPublicTodos>>[number]['title']
>().toEqualTypeOf<string>()
