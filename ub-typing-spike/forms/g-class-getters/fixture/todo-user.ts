import { App, field } from './app.ts'
import { TodoRole } from './todo-role.ts'
import { Todo } from './todo.ts'

export class TodoUser extends App.PasswordUserSchema('TodoUser', {
	displayName: field.string({ required: true }),
	get assignedTodos() {
		return field.relation(Todo, { mappedBy: 'assignee' })
	},
	get roles() {
		return field.relation(TodoRole, { mappedBy: 'members' })
	},
}) {
	static access = this.rules.access({
		// Cross-schema filter User -> Todo; Todo filters on User in the other direction.
		read: { where: (user) => user.some('assignedTodos', (todo) => todo.eq('archived', false)) },
		update: { where: (user, { userId }) => user.eq('id', userId ?? '') },
	})

	static hooks = this.rules.hooks({
		fields: { displayName: { resolveInput: (value) => value.trim() } },
	})
}
