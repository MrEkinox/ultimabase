// Registration checks (errors are expected; the probe removes each directive to print the message).
import { App } from './app.ts'
import { Tag } from './tag.ts'
import { TodoRole } from './todo-role.ts'
import { TodoUser } from './todo-user.ts'
import { Todo } from './todo.ts'

/** A second schema from the RoleSchema factory. */
export class ExtraRole extends App.RoleSchema('ExtraRole', { members: () => TodoUser }) {}

/** Active Record attempt: behaviour added to the schema class. */
export class ActiveTodo extends App.Schema('ActiveTodo', (field) => ({ title: field.string() })) {
	static {
		this.access({ read: true })
	}
	static archiveAll(): void {}
	save(): void {}
}

/** Rules written as a static property (the E1/E2 habit) instead of the static block. */
export class StaticOptions extends App.Schema('StaticOptions', (field) => ({ title: field.string() })) {
	static options = { access: { read: true } }
}

// @ts-expect-error second RoleSchema schema
export const twoRoles = new App({ schemas: [TodoUser, TodoRole, Todo, Tag, ExtraRole] })
// @ts-expect-error custom static and instance members
export const active = new App({ schemas: [TodoUser, TodoRole, Todo, Tag, ActiveTodo] })
// @ts-expect-error static options property
export const staticOptions = new App({ schemas: [TodoUser, TodoRole, Todo, Tag, StaticOptions] })
// @ts-expect-error no RoleSchema schema registered
export const noRole = new App({ schemas: [TodoUser, Todo, Tag] })

// Sealing is a runtime rule: after registration a rule call throws (see runtime-check.mjs).
export const lateRule = (): void => Todo.access({ read: true })
