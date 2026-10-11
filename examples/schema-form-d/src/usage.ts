import type { ACLContainmentOperand } from '@ultimabase/acl-permissions-plugin'
import type {
	CreateInput,
	Item,
	Model,
	Select,
	UpdateInput,
	Where,
} from '@ultimabase/core'
import { rolesPlugin } from '@ultimabase/roles-plugin'
import { expectTypeOf } from 'vitest'

import { Tag } from './tag.ts'
import { Todo } from './todo.ts'
import { TodoRole } from './todo-role.ts'
import { TodoUser } from './todo-user.ts'
import { ultimabase } from './ultimabase.ts'

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
	| 'deletedAt'
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

// ADR-0310: `CreateInput` and `UpdateInput`, by name or by schema type, are
// exactly the `data` of `createOne` and `updateOne`.
declare const namedCreate: CreateInput<'Todo'>
declare const schemaCreate: CreateInput<typeof Todo>
declare const namedUpdate: UpdateInput<'Todo'>
declare const schemaUpdate: UpdateInput<typeof Todo>
export const createFromInputs = () =>
	Promise.all([
		Todo.createOne({ data: namedCreate }),
		Todo.createOne({ data: schemaCreate }),
	])
export const updateFromInputs = () =>
	Promise.all([
		Todo.updateOne({ where: { title: { eq: 'x' } }, data: namedUpdate }),
		Todo.updateOne({ where: { title: { eq: 'x' } }, data: schemaUpdate }),
	])
expectTypeOf<CreateInput<'Todo'>>().toEqualTypeOf<
	Parameters<typeof Todo.createOne>[0]['data']
>()
expectTypeOf<UpdateInput<'Todo'>>().toEqualTypeOf<
	Parameters<typeof Todo.updateOne>[0]['data']
>()
expectTypeOf<UpdateInput<typeof Todo>>().toEqualTypeOf<UpdateInput<'Todo'>>()
// Nested links and numeric-free boolean fields share one update value.
export const linkPatch: UpdateInput<'Todo'> = {
	tags: { connect: ['0198f090-2a50-7000-8000-000000000001'] },
}
// @ts-expect-error -- Update data names at least one field.
export const emptyPatch: UpdateInput<'Todo'> = {}

// ADR-0322: role schemas come from `App.RoleSchema` and register like any
// schema; `includedRoles` links roles, `role()` names one.
expectTypeOf<Model<'TodoRole'>['name']>().toEqualTypeOf<string>()
expectTypeOf<Model<'TodoRole'>['description']>().toEqualTypeOf<string | null>()
expectTypeOf(TodoRole.role('admin').kind).toEqualTypeOf<'role'>()
export const listAdmins = () =>
	TodoUser.findMany({
		where: { roles: { some: { name: { eq: 'admin' } } } },
		select: { email: true },
	})
export const includeRole = (roleId: string, childId: string) =>
	TodoRole.updateOne({
		where: { id: roleId },
		data: { includedRoles: { connect: [childId] } },
	})
export const currentRoles = () =>
	ultimabase.plugin(rolesPlugin).current(TodoRole)
expectTypeOf<Awaited1<ReturnType<typeof currentRoles>>>().toEqualTypeOf<
	readonly string[]
>()
// ADR-0321: sharing a todo without reading its ACL first.
export const shareTodo = (todoId: string, userId: string) =>
	Todo.updateOne({
		where: { id: todoId },
		data: {
			acl: {
				grant: { principal: TodoUser.pointer(userId), permissions: ['read'] },
			},
		},
	})
