import { App } from '../fixture/src/app.ts'
import { Todo } from '../fixture/src/todo.ts'

export const Tag = App.Schema.define({
	className: 'Tag',
	fields: (field) => ({
		name: field.string({ required: true }),
		todos: field.relation({ target: () => Todo, mappedBy: 'tags' }),
	}),
	access: {
		// Two hops: Tag -> Todo -> TodoUser.
		read() {
			return this.where.some('todos', (todo) => todo.is('assignee', (user) => user.eq('id', this.userId)))
		},
	},
})
