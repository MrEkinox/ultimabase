import { App } from './factory.ts'
import { Role } from './role.ts'
import { Tag } from './tag.ts'
import { Todo } from './todo.ts'
import { User } from './user.ts'

/** Registered schemas; also the type-level name registry for string targets. */
export const schemas = [User, Role, Todo, Tag] as const

export const app = new App({ schemas })

declare module '../../../lib/types.ts' {
	interface Register {
		readonly schemas: typeof schemas
	}
}
