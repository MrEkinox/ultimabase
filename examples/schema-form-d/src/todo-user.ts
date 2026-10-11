import { App } from './app.ts'
import { Todo } from './todo.ts'

/** Owns assigned todos; its read rule filters through Todo (User -> Todo). */
export const TodoUser = App.Schema.define({
	className: 'TodoUser',
	fields: (field) => ({
		email: field.string({ required: true }),
		displayName: field.string(),
		assignedTodos: field.relation({ target: () => Todo, mappedBy: 'assignee' }),
	}),
}).with({
	access: {
		read: ({ where }) =>
			where.some('assignedTodos', (todo) => todo.eq('archived', false)),
		create: true,
	},
})
