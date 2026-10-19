import { App } from './app.ts'
import { TodoUser } from './todo-user.ts'

export const TodoRole = App.RoleSchema.define({
	className: 'TodoRole',
	members: () => TodoUser,
	fields: (field) => ({ description: field.string() }),
})
