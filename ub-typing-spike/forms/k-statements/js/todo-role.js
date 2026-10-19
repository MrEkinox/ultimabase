// Plain JavaScript copy of fixture/src/todo-role.ts (form K').
import { App } from '../fixture/src/app.ts'
import { TodoUser } from '../fixture/src/todo-user.ts'

export const TodoRole = App.RoleSchema.define({
	className: 'TodoRole',
	members: () => TodoUser,
	fields: (field) => ({ description: field.string() }),
})

TodoRole.access({
	read: { where: ({ where, userId }) => where.some('members', (user) => user.eq('id', userId)) },
	create: false,
})
