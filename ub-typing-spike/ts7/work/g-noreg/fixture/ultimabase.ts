import { App } from './app.ts'
import { Tag } from './tag.ts'
import { TodoRole } from './todo-role.ts'
import { TodoUser } from './todo-user.ts'
import { Todo } from './todo.ts'

export const ultimabase = new App({ schemas: [TodoUser, TodoRole, Todo, Tag] })
