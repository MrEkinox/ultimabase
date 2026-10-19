// Plain JavaScript copy of fixture/src/tag.ts (form E1). The annotation cannot be written in
// JavaScript; with `checkJs` a JSDoc `@type` restores the contextual typing (see js/tag-checked.js).
import { App } from '../fixture/src/app.ts'
import { Todo } from '../fixture/src/todo.ts'

export class JsTag extends App.Schema('JsTag', (field) => ({
	name: field.string({ required: true }),
	todos: field.relation({ target: () => Todo, mappedBy: 'tags' }),
})) {
	static options = {
		access: {
			read: { where: ({ where, userId }) => where.some('todos', (todo) => todo.is('assignee', (user) => user.eq('id', userId ?? ''))) },
			delete: { where: () => false },
		},
	}
}
