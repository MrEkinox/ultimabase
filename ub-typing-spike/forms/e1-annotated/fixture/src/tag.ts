import { App, type Options } from './app.ts'
import { Todo } from './todo.ts'

export class Tag extends App.Schema('Tag', (field) => ({
	name: field.string({ required: true }),
	todos: field.relation({ target: () => Todo, mappedBy: 'tags' }),
})) {
	static readonly options: Options<typeof Tag> = {
		access: {
			// Two hops: Tag -> Todo -> TodoUser.
			read: { where: ({ where, userId }) => where.some('todos', (todo) => todo.is('assignee', (user) => user.eq('id', userId ?? ''))) },
			delete: { where: () => false },
		},
	}
}
