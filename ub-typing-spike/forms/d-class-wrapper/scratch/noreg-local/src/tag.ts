import { App } from './app.ts'
import { Todo } from './todo.ts'

export class Tag extends App.Schema.define({
	className: 'Tag',
	fields: (field) => ({
		name: field.string({ required: true }),
		todos: field.relation({ target: () => Todo, mappedBy: 'tags' }),
	}),
}).with({
	access: {
		// Two hops: Tag -> Todo -> TodoUser.
		read: { where: ({ where, userId }) => where.eq('name', userId) },
	},
}) {}
