// JavaScript copy of fixture/src/tag.ts with the E1 annotation written as JSDoc (checkJs).
/** @import { Options } from '../fixture/src/app.ts' */
import { App } from '../fixture/src/app.ts'
import { Todo } from '../fixture/src/todo.ts'

export class JsCheckedTag extends App.Schema('JsCheckedTag', (field) => ({
	name: field.string({ required: true }),
	todos: field.relation({ target: () => Todo, mappedBy: 'tags' }),
})) {
	/** @type {Options<typeof JsCheckedTag>} */
	static options = {
		access: {
			read: { where: ({ where, userId }) => where.some('todos', (todo) => todo.is('assignee', (user) => user.eq('id', userId ?? ''))) },
			delete: { where: () => 42 },
		},
	}
}
