// Plain JavaScript copy of fixture/src/todo-role.ts (form L: data only).
import { App } from '../fixture/src/app.ts'
import { TodoUser } from '../fixture/src/todo-user.ts'

export const TodoRole = App.RoleSchema.define({
	className: 'TodoRole',
	members: () => TodoUser,
	fields: (field) => ({ description: field.string() }),
})
