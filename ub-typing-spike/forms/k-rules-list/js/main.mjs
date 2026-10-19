// Registers the TypeScript schemas plus the JavaScript TodoRole.
import { App } from '../fixture/src/app.ts'
import { Tag, tagRules } from '../fixture/src/tag.ts'
import { Todo, todoRules } from '../fixture/src/todo.ts'
import { TodoUser, todoUserRules } from '../fixture/src/todo-user.ts'
import { TodoRole, todoRoleRules } from './todo-role.js'

const app = new App({ schemas: [TodoUser, TodoRole, Todo, Tag], rules: [todoUserRules, todoRoleRules, todoRules, tagRules] })
const role = app.registration.find((entry) => entry.className === 'TodoRole')
console.log('JS TodoRole fields:', Object.keys(role.fields).join(', '), '| rules:', Object.keys(role.rules).join(', '))
