import type { ACL } from '../../lib/plugins.ts'
import { App, type Options } from './app.ts'
import { TodoPriority } from './enums.ts'
import { Tag } from './tag.ts'
import { TodoUser } from './todo-user.ts'

declare const privateAcl: ACL

export class Todo extends App.Schema('Todo', (field) => ({
	title: field.string({ required: true, validate: (title) => title.length > 0 || 'title is empty' }),
	archived: field.boolean({ default: false }),
	priority: field.enum({ values: TodoPriority, default: 'normal' }),
	allowedPriorities: field.enum({ values: TodoPriority, list: true }),
	status: field.enum({ values: ['open', 'inProgress', 'done'], required: true, default: 'open' }),
	assignee: field.pointer({ target: () => TodoUser, onDelete: 'setNull' }),
	parent: field.pointer({ target: () => Todo }),
	subtasks: field.relation({ target: () => Todo, mappedBy: 'parent' }),
	tags: field.relation({ target: () => Tag }),
})).softDelete() {
	static readonly options: Options<typeof Todo> = {
		access: {
			read: { where: ({ where }) => where.eq('archived', false) },
			update: {
				where: ({ where, userId }) => where.is('assignee', (user) => user.eq('id', userId ?? '')),
			},
			delete: { where: ({ where }) => where.is('assignee', (user) => user.eq('email', 'admin@todo.test')) },
		},
		acl: { default: () => privateAcl.grantRole('admin', 'read', 'update') },
		hooks: {
			beforeUpdate: ({ item }) => {
				if (item.isDeleted) throw new TypeError('Deleted todos are read-only')
			},
		},
		postgres: { table: 'todos', indexes: [{ fields: ['archived', 'priority'] }] },
	}
}
