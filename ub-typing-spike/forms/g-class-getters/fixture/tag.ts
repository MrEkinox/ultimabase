import { App, field } from './app.ts'
import { Todo } from './todo.ts'

export class Tag extends App.Schema('Tag', {
	name: field.string({ required: true }),
	get todos() {
		return field.relation(Todo, { mappedBy: 'tags' })
	},
}) {
	static access = this.rules.access({
		// Two hops: Tag -> Todo -> TodoUser.
		read: { where: (tag) => tag.some('todos', (todo) => todo.is('assignee', (user) => user.eq('displayName', 'Ada'))) },
		delete: { where: () => false },
	})
}
