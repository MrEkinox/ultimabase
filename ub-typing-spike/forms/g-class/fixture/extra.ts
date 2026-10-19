import { App, field } from './app.ts'
import { TodoUser } from './todo-user.ts'

// A second schema from the roles factory; registering it must fail (exactly one).
export class SecondRole extends App.RoleSchema('SecondRole', { level: field.int() }, { members: () => TodoUser }) {}
