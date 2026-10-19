// Plain JavaScript copy of fixture/src/tag.ts (form E2): identical code, `this.with` types it under checkJs.
import { App } from '../fixture/src/app.ts'
import { Todo } from '../fixture/src/todo.ts'

export class JsTag extends App.Schema('JsTag', (field) => ({
	name: field.string({ required: true }),
	todos: field.relation({ target: () => Todo, mappedBy: 'tags' }),
})) {
	static options = this.with({
		access: {
			read: { where: ({ where, userId }) => where.some('todos', (todo) => todo.is('assignee', (user) => user.eq('id', userId ?? ''))) },
			delete: { where: () => false },
		},
	})
}
