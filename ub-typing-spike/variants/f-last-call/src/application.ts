import { App } from './factory.ts'
import { Role } from './role.ts'
import { Tag } from './tag.ts'
import { Todo } from './todo.ts'
import { User } from './user.ts'

export const app = new App({ schemas: [User, Role, Todo, Tag] })

