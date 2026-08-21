import { ultimabase } from './application.ts'
import { Todo, TodoRole, TodoUser } from './schema.ts'
import type { TodoUserCreateInput } from '../.ultimabase/schema.generated.js'

const masterOptions = { ultimabase, useMasterKey: true } as const

/** Creates one application member through the same schema-owned mutation API. */
export const createTodoUser = (data: TodoUserCreateInput) =>
	TodoUser.createOne({ data }, masterOptions)

/** Creates a persisted role whose result exposes role-specific model commands. */
export const createTodoRole = (
	name: string,
	description: string | null = null,
) => new TodoRole({ description, name }).create({}, masterOptions)

/** Adds one exact TodoUser pointer to a persisted role relation. */
export const addUserToRole = async (
	role: Awaited<ReturnType<typeof createTodoRole>>,
	userId: string,
): Promise<void> => {
	await role.addMember(TodoUser.pointer(userId), masterOptions)
}

/** Makes every direct and inherited child member belong to the parent role. */
export const addChildRole = async (
	parent: Awaited<ReturnType<typeof createTodoRole>>,
	child: Awaited<ReturnType<typeof createTodoRole>>,
): Promise<void> => {
	await parent.addRole(child, masterOptions)
}

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
