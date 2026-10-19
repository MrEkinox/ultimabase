import { App } from './app.ts'
import { TodoUser } from './todo-user.ts'

export class TodoRole extends App.RoleSchema('TodoRole', {
	members: () => TodoUser,
	fields: (field) => ({ description: field.string() }),
}) {
	static options = this.with({
		access: {
			read: { where: ({ where }) => where.some('members', (user) => user.eq('displayName', 'admin')) },
			create: false,
		},
	})
}
