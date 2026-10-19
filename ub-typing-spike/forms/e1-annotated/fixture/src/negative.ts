// Registration checks (errors are expected; the probe removes each directive to print the message).
import { App, type Options } from './app.ts'
import { Tag } from './tag.ts'
import { TodoRole } from './todo-role.ts'
import { TodoUser } from './todo-user.ts'
import { Todo } from './todo.ts'

/** A second schema from the RoleSchema factory. */
export class ExtraRole extends App.RoleSchema('ExtraRole', { members: () => TodoUser }) {}

/** Active Record attempt: behaviour added to the schema class. */
export class ActiveTodo extends App.Schema('ActiveTodo', (field) => ({ title: field.string() })) {
	static readonly options: Options<typeof ActiveTodo> = {}
	static archiveAll(): void {}
	save(): void {}
}

/** Options written without the annotation. */
export class Unannotated extends App.Schema('Unannotated', (field) => ({ title: field.string() })) {
	static readonly options = { access: { read: 'yes' } }
}

// @ts-expect-error second RoleSchema schema
export const twoRoles = new App({ schemas: [TodoUser, TodoRole, Todo, Tag, ExtraRole] })
// @ts-expect-error custom static and instance members
export const active = new App({ schemas: [TodoUser, TodoRole, Todo, Tag, ActiveTodo] })
// @ts-expect-error unannotated options with a wrong value
export const unannotated = new App({ schemas: [TodoUser, TodoRole, Todo, Tag, Unannotated] })
// @ts-expect-error no RoleSchema schema registered
export const noRole = new App({ schemas: [TodoUser, Todo, Tag] })
