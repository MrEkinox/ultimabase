import { App } from './app.ts'
import { Todo } from './todo.ts'

/** Labels todos; its read rule crosses two hops (Tag -> Todo -> TodoUser). */
export const Tag = App.Schema.define({
	className: 'Tag',
	fields: (field) => ({
		label: field.string({ required: true }),
		todos: field.relation({ target: () => Todo, mappedBy: 'tags' }),
	}),
}).with({
	access: {
		read: {
			where: ({ where }) =>
				where.some('todos', (todo) =>
					todo.is('assignee', (user) => user.endsWith('email', '@team.test')),
				),
		},
		create: true,
	},
})
