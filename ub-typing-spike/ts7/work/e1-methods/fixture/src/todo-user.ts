import { App, type Options } from './app.ts'
import { TodoRole } from './todo-role.ts'
import { Todo } from './todo.ts'

export class TodoUser extends App.PasswordUserSchema('TodoUser', (field) => ({
	displayName: field.string({ required: true, hooks: { resolveInput: ({ value }) => value.trim() } }),
	assignedTodos: field.relation({ target: () => Todo, mappedBy: 'assignee' }),
	roles: field.relation({ target: () => TodoRole, mappedBy: 'members' }),
})) {
	static readonly options: Options<typeof TodoUser> = {
		access: {
			// Cross-schema filter User -> Todo; Todo filters on User in the other direction.
			read: { where: ({ where }) => where.some('assignedTodos', (todo) => todo.eq('archived', false)) },
			update: { where: ({ where, userId }) => where.eq('id', userId ?? '') },
		},
		postgres: { table: 'users' },
	}
}
