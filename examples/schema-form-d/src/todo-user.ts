import { hasRole } from '@ultimabase/roles-plugin'

import { App } from './app.ts'
import { Todo } from './todo.ts'
import { TodoRole } from './todo-role.ts'

/**
 * The User of `authPlugin` (ADR-0326): `password({ identifier: 'email' })`
 * adds `email`. Owns assigned todos; its read rule filters through Todo.
 */
export const TodoUser = App.UserSchema.define({
	className: 'TodoUser',
	fields: (field) => ({
		displayName: field.string(),
		assignedTodos: field.relation({ target: () => Todo, mappedBy: 'assignee' }),
		roles: field.relation({ target: () => TodoRole, mappedBy: 'members' }),
	}),
}).with({
	access: {
		read: ({ where }) =>
			where.some('assignedTodos', (todo) => todo.eq('archived', false)),
		create: true,
		// A role predicate and a filter through the role schema (User -> Role).
		update: hasRole(TodoRole.role('admin')),
		delete: ({ where }) =>
			where.some('roles', (role) => role.eq('name', 'admin')),
	},
})
