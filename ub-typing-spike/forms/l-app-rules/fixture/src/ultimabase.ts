import type { ACL } from '../../lib/plugins.ts'
import { App } from './app.ts'
import { Tag } from './tag.ts'
import { Todo } from './todo.ts'
import { TodoRole } from './todo-role.ts'
import { TodoUser } from './todo-user.ts'

declare const acl: ACL

export const ultimabase = new App({
	schemas: [TodoUser, TodoRole, Todo, Tag],
	rules: {
		TodoUser: {
			access: {
				// Cross-schema filter, direction TodoUser -> Todo.
				read: { where: ({ where }) => where.some('assignedTodos', (todo) => todo.eq('archived', false)) },
				update: { where: ({ where, userId }) => where.eq('id', userId) },
			},
			postgres: { table: 'users' },
		},
		TodoRole: {
			access: {
				read: { where: ({ where, userId }) => where.some('members', (user) => user.eq('id', userId)) },
				create: false,
			},
		},
		Todo: {
			access: {
				read: { where: ({ where }) => where.eq('archived', false) },
				update: {
					where: ({ where, userId }) => where.is('assignee', (user) => user.eq('id', userId)),
				},
				delete: { where: () => ({ assignee: { is: { email: { endsWith: '@admin.test' } } } }) },
			},
			acl: { default: () => acl.grantRole('TodoRole', 'read', 'update') },
			hooks: {
				beforeUpdate: ({ item }) => {
					if (item.isDeleted) throw new TypeError('Deleted todos are read-only')
				},
			},
			postgres: { table: 'todos', indexes: [{ fields: ['status', 'dueAt'] }] },
		},
		Tag: {
			access: {
				// Two hops: Tag -> Todo -> TodoUser.
				read: { where: ({ where, userId }) => where.some('todos', (todo) => todo.is('assignee', (user) => user.eq('id', userId))) },
			},
		},
	},
})
