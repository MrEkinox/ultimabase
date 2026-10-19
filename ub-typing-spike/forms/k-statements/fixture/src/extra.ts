import { App } from './app.ts'
import { TodoUser } from './todo-user.ts'

// A second schema from the roles factory; registering it must fail (exactly one role schema).
export const StaffRole = App.RoleSchema.define({ className: 'StaffRole', members: () => TodoUser })

StaffRole.access({})
