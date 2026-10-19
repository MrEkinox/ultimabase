import { App, field } from './app.ts'
import { TodoUser } from './todo-user.ts'

export class TodoRole extends App.RoleSchema('TodoRole', { description: field.string() }, { members: () => TodoUser }) {
	static access = this.rules.access({
		read: { where: (role, { userId }) => role.some('members', (user) => user.eq('id', userId ?? '')) },
		create: false,
	})
}
