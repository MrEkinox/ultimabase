import { App } from '../../lib/core.ts'
import { Tag } from './tag.ts'
import { TodoUser } from './todo-user.ts'
import { Todo } from './todo.ts'

export const ultimabase = new App({ schemas: [TodoUser, Todo, Tag] })

declare module '../../lib/types.ts' {
	interface Register {
		readonly app: typeof ultimabase
	}
}
