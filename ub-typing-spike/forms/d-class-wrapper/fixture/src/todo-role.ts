import { App } from './app.ts'
import { TodoUser } from './todo-user.ts'

export class TodoRole extends App.RoleSchema.define({
	className: 'TodoRole',
	members: () => TodoUser,
	fields: (field) => ({ description: field.string() }),
}).with({
	access: {
		read: { where: ({ where, userId }) => where.some('members', (user) => user.eq('id', userId)) },
		create: false,
	},
}) {}
