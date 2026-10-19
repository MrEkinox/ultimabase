import { App } from './factory.ts'
import { Todo } from './todo.ts'

export const Tag = App.Schema.define({
	className: 'Tag',
	fields: (field) => ({
		label: field.string({ required: true }),
		todos: field.relation({ target: () => Todo, mappedBy: 'tags' }),
	}),
}).access({ read: true })
