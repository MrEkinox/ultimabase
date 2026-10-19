import { App } from './factory.ts'
import { TodoUser } from './todo-user.ts'

// The roles factory owns `name` and `members` (to TodoUser) and adds `addMember`.
export const TodoRole = App.RoleSchema.define({
	className: 'TodoRole',
	members: () => TodoUser,
	fields: (field) => ({ description: field.string(), priority: field.int({ default: 0 }) }),
}).access({
	read: { where: ({ where }) => where.some('members', (user) => user.some('assignedTodos', (todo) => todo.eq('completed', false))) },
	create: false,
})
