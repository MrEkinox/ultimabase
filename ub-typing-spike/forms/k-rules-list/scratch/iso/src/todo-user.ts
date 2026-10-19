import { App } from './app.ts'
import { Todo } from './todo.ts'

export const TodoUser = App.PasswordUserSchema.define({
	className: 'TodoUser',
	fields: (field) => ({
		displayName: field.string({ required: true, hooks: { resolveInput: ({ value }) => value.trim() } }),
		assignedTodos: field.relation({ target: () => Todo, mappedBy: 'assignee' }),
	}),
})

export const todoUserRules = TodoUser.rules({
	access: {
		// Cross-schema filter, direction TodoUser -> Todo.
		read: { where: ({ where }) => where.some('assignedTodos', (todo) => todo.eq('archived', false)) },
		update: { where: ({ where, userId }) => where.eq('id', userId) },
	},
	postgres: { table: 'users' },
})
