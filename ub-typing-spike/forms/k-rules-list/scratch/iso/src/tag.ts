import type { SchemaRules } from '../../../lib/core.ts'
import { App } from './app.ts'
import { Todo } from './todo.ts'

export const Tag = App.Schema.define({
	className: 'Tag',
	fields: (field) => ({
		name: field.string({ required: true }),
		todos: field.relation({ target: () => Todo, mappedBy: 'tags' }),
	}),
})

export const tagRules: SchemaRules<'Tag'> = Tag.rules({
	access: {
		// Two hops: Tag -> Todo -> TodoUser.
		read: { where: ({ where, userId }) => where.some('todos', (todo) => todo.is('assignee', (user) => user.eq('id', userId))) },
	},
})
