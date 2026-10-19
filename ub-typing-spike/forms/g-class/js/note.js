import { App, field } from '../fixture/app.ts'
import { Todo } from '../fixture/todo.ts'

export class Note extends App.Schema('Note', {
	body: field.string({ required: true }),
	todo: field.pointer(() => Todo),
}, { softDelete: true }) {
	static access = this.rules.access({
		read: { where: (note) => note.is('todo', (todo) => todo.is('assignee', (user) => user.eq('displayName', 'Ada'))) },
	})

	static hooks = this.rules.hooks({
		beforeSave: ({ item }) => {
			if (item.isDeleted) throw new TypeError('deleted')
		},
	})
}
