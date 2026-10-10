import { Todo, TodoRole, TodoUser } from './schema.ts'
import type { TodoUserCreateInput } from '../.ultimabase/schema.generated.js'

const masterOptions = { useMasterKey: true } as const

/** Creates one application member through the same schema-owned mutation API. */
export const createTodoUser = (data: TodoUserCreateInput) =>
	TodoUser.createOne({ data }, masterOptions)

/** Creates one persisted role through the schema-owned mutation API. */
export const createTodoRole = (
	name: string,
	description: string | null = null,
) => TodoRole.createOne({ data: { description, name } }, masterOptions)

/** Links one user to a role through the checked `connect` command. */
export const addUserToRole = (roleId: string, userId: string) =>
	TodoRole.updateOne(
		{
			data: { members: { connect: [userId] } },
			select: { id: true },
			where: { id: { eq: roleId } },
		},
		masterOptions,
	)

/** Makes every direct and inherited child member belong to the parent role. */
export const addChildRole = (parentId: string, childId: string) =>
	TodoRole.updateOne(
		{
			data: { roles: { connect: [childId] } },
			select: { id: true },
			where: { id: { eq: parentId } },
		},
		masterOptions,
	)

/** Replaces a Todo ACL immutably while retaining all of its existing grants. */
export const grantTodoToUser = async (todoId: string, userId: string) => {
	const todo = await Todo.findOne(
		{
			select: { acl: true, id: true },
			where: { id: { eq: todoId } },
		},
		masterOptions,
	)

	if (todo === null) {
		return null
	}

	return Todo.updateOne(
		{
			data: {
				acl: todo.acl.grantPrincipal(
					TodoUser.pointer(userId),
					'read',
					'update',
				),
			},
			select: { acl: true, id: true },
			where: { id: { eq: todoId } },
		},
		masterOptions,
	)
}
