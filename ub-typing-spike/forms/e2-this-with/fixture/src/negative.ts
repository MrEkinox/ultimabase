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
	static options = this.with({})
	static archiveAll(): void {}
	save(): void {}
}

/** Options written as a plain object instead of `this.with(...)`. */
export class Unannotated extends App.Schema('Unannotated', (field) => ({ title: field.string() })) {
	static options = { access: { read: true } }
}

/** Rules borrowed from another schema class. */
export class Borrowed extends App.Schema('Borrowed', (field) => ({ title: field.string() })) {
	static options = Unannotated.with({})
}

// @ts-expect-error second RoleSchema schema
export const twoRoles = new App({ schemas: [TodoUser, TodoRole, Todo, Tag, ExtraRole] })
// @ts-expect-error custom static and instance members
export const active = new App({ schemas: [TodoUser, TodoRole, Todo, Tag, ActiveTodo] })
// @ts-expect-error plain object options
export const unannotated = new App({ schemas: [TodoUser, TodoRole, Todo, Tag, Unannotated] })
// @ts-expect-error options of another class
export const borrowed = new App({ schemas: [TodoUser, TodoRole, Todo, Tag, Borrowed] })
// @ts-expect-error no RoleSchema schema registered
export const noRole = new App({ schemas: [TodoUser, Todo, Tag] })
