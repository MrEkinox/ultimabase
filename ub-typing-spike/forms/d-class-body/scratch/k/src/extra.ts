import { App } from './app.ts'
import { TodoUser } from './todo-user.ts'

// A second schema from the roles factory; registering it next to TodoRole must fail.
export const AdminRole = App.RoleSchema.define({ className: 'AdminRole', members: () => TodoUser })
