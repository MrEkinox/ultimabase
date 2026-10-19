// Registers the TypeScript schemas plus the JavaScript TodoRole.
import { App } from '../fixture/src/app.ts'
import { Tag } from '../fixture/src/tag.ts'
import { Todo } from '../fixture/src/todo.ts'
import { TodoUser } from '../fixture/src/todo-user.ts'
import { TodoRole } from './todo-role.js'

const app = new App({ schemas: [TodoUser, TodoRole, Todo, Tag] })
const role = app.registration.find((entry) => entry.className === 'TodoRole')
console.log('JS TodoRole fields:', Object.keys(role.fields).join(', '), '| rules:', Object.keys(role.rules).join(', '))
