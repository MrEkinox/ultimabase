import { App } from './app.ts'
import { Todo } from './todo.ts'

/**
 * Labels todos; its read rule crosses two hops (Tag -> Todo -> TodoUser) and
 * its relation lists only open todos.
 */
export const Tag = App.Schema.define({
	className: 'Tag',
	fields: (field) => ({
		label: field.string({ required: true }),
		todos: field.relation({ target: () => Todo, mappedBy: 'tags' }),
	}),
}).with({
	access: {
		read: ({ where }) =>
			where.some('todos', (todo) =>
				todo.is('assignee', (user) => user.endsWith('email', '@team.test')),
			),
		create: true,
	},
	// Tag and Todo filter each other's relations (ADR-0328).
	relations: { todos: { where: { archived: { eq: false } } } },
})
