import { App } from '../fixture/src/app.ts'
import { Todo } from '../fixture/src/todo.ts'

export const Tag = App.Schema.define({
	className: 'Tag',
	fields: (field) => ({
		name: field.string({ required: true }),
		get todos() {
			return field.relation({ target: Todo, mappedBy: 'tags' })
		},
	}),
}).with({
	access: {
		// Two hops: Tag -> Todo -> TodoUser.
		read: { where: ({ where, userId }) => where.some('todos', (todo) => todo.is('assignee', (user) => user.eq('id', userId))) },
	},
})
