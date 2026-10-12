import { hasRole } from '@ultimabase/roles-plugin'

import { App } from './app.ts'
import { Todo } from './todo.ts'
import { TodoRole } from './todo-role.ts'

/** Owns assigned todos; its read rule filters through Todo (User -> Todo). */
export const TodoUser = App.Schema.define({
	className: 'TodoUser',
	fields: (field) => ({
		email: field.string({ required: true }),
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
