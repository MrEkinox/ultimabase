// Plain JavaScript application with rules (form L), using the JavaScript TodoRole.
import { App } from '../fixture/src/app.ts'
import { Tag } from '../fixture/src/tag.ts'
import { Todo } from '../fixture/src/todo.ts'
import { TodoUser } from '../fixture/src/todo-user.ts'
import { TodoRole } from './todo-role.js'

export const app = new App({
	schemas: [TodoUser, TodoRole, Todo, Tag],
	rules: {
		TodoRole: {
			access: {
				read: { where: ({ where, userId }) => where.some('members', (user) => user.eq('id', userId)) },
				create: false,
			},
		},
	},
})
