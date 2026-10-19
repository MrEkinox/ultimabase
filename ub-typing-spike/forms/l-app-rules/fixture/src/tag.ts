import { App } from './app.ts'
import { Todo } from './todo.ts'

export const Tag = App.Schema.define({
	className: 'Tag',
	fields: (field) => ({
		name: field.string({ required: true }),
		todos: field.relation({ target: () => Todo, mappedBy: 'tags' }),
	}),
})
