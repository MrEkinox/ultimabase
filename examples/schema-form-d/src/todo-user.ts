import { App } from './app.ts'
import { Todo } from './todo.ts'

export const TodoUser = App.Schema.define({
	className: 'TodoUser',
	fields: (field) => ({
		email: field.string({ required: true }),
		assignedTodos: field.relation({ target: () => Todo, mappedBy: 'assignee' }),
	}),
}).with({
	access: {
		read: {
			where: ({ where }) =>
				where.some('assignedTodos', (todo) => todo.eq('archived', false)),
		},
	},
})
