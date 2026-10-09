import { App } from './app.ts'
import { Todo } from './todo.ts'
import { TodoUser } from './todo-user.ts'

export const ultimabase = new App({ schemas: [TodoUser, Todo] })

// Once per application, for name-keyed editor types (optional).
declare module '@ultimabase/core' {
	interface Register {
		readonly app: typeof ultimabase
	}
}
