import { App } from '../fixture/src/app.ts'
import { Todo } from '../fixture/src/todo.ts'

export class Tag extends App.Schema.define({
	className: 'Tag',
	fields: (field) => ({
		name: field.string({ required: true }),
		todos: field.relation({ target: () => Todo, mappedBy: 'tags' }),
	}),
}) {
	static rules = this.with({
		access: {
			// Two hops: Tag -> Todo -> TodoUser.
			read: { where: ({ where, userId }) => where.some('todos', (todo) => todo.is('assignee', (user) => user.eq('id', userId))) },
		},
	})

	static findNamed() {
		return this.findMany({ where: { name: { eq: 'x' } } })
	}
}
