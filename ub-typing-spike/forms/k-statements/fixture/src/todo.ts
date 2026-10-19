import type { ACL } from '../../lib/plugins.ts'
import { App } from './app.ts'
import { TodoPriority } from './enums.ts'
import { Tag } from './tag.ts'
import { TodoUser } from './todo-user.ts'

declare const acl: ACL

export const Todo = App.Schema.define({
	className: 'Todo',
	softDelete: true,
	fields: (field) => ({
		title: field.string({ required: true, validate: (value) => value.length <= 200 || 'title is too long' }),
		archived: field.boolean({ required: true, default: false }),
		priority: field.enum({ values: TodoPriority, default: 'normal' }),
		allowedPriorities: field.list(field.enum({ values: TodoPriority })),
		status: field.enum({ values: ['todo', 'doing', 'done'], required: true, default: 'todo' }),
		dueAt: field.date(),
		assignee: field.pointer({ target: () => TodoUser, onDelete: 'setNull' }),
		parent: field.pointer({ target: () => Todo }),
		subtasks: field.relation({ target: () => Todo, mappedBy: 'parent' }),
		tags: field.relation({ target: () => Tag }),
	}),
})

Todo.access({
	read: { where: ({ where }) => where.eq('archived', false) },
	update: {
		where: ({ where, userId }) => where.is('assignee', (user) => user.eq('id', userId)),
	},
	delete: { where: () => ({ assignee: { is: { email: { endsWith: '@admin.test' } } } }) },
})

Todo.acl({ default: () => acl.grantRole('TodoRole', 'read', 'update') })

Todo.hooks({
	beforeUpdate: ({ item }) => {
		if (item.isDeleted) throw new TypeError('Deleted todos are read-only')
	},
})

Todo.postgres({ table: 'todos', indexes: [{ fields: ['status', 'dueAt'] }] })
