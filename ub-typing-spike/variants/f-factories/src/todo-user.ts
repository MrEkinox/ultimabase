import { App } from './factory.ts'
import { TodoRole } from './todo-role.ts'
import { Todo } from './todo.ts'

// The password-auth factory owns `username` and `email` and adds `signUp`/`login`.
export const TodoUser = App.PasswordUserSchema.define({
	className: 'User',
	fields: (field) => ({
		displayName: field.string({ required: true }),
		assignedTodos: field.relation({ target: () => Todo, mappedBy: 'assignee' }),
		roles: field.relation({ target: () => TodoRole, mappedBy: 'members' }),
	}),
})
	.postgres({ table: 'users' })
	.hooks({
		beforeSave: ({ item }) => {
			if (item.displayName.trim() === '' || item.email === '') throw new TypeError('displayName is empty')
		},
	})
	.access({
		// Cross-schema filters towards Todo and towards the role schema.
		read: { where: ({ where }) => where.some('assignedTodos', (todo) => todo.eq('archived', false)) },
		update: { where: ({ where, userId }) => where.and(where.eq('id', userId ?? ''), where.some('roles', (role) => role.eq('name', 'admin'))) },
	})
