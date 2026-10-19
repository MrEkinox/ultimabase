import { Customer } from './extra.ts'
import { App } from './factory.ts'
import { TodoRole } from './todo-role.ts'
import { Tag } from './tag.ts'
import { Todo } from './todo.ts'
import { TodoUser } from './todo-user.ts'

export const app = new App({ schemas: [TodoUser, TodoRole, Todo, Tag] })

