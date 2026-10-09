import { ACL } from '@ultimabase/acl-permissions-plugin'

import { App } from './app.ts'
import { Tag } from './tag.ts'
import { TodoUser } from './todo-user.ts'

/** Soft-deleted, ACL-protected todo whose rules filter through TodoUser (Todo -> User). */
export const Todo = App.Schema.define({
	className: 'Todo',
	fields: (field) => ({
		title: field.string({ required: true }),
		archived: field.boolean({ required: true, default: false }),
		priority: field.enum({
			values: ['low', 'normal', 'high'],
			default: 'normal',
		}),
		assignee: field.pointer({ target: () => TodoUser, onDelete: 'setNull' }),
		parent: field.pointer({ target: () => Todo }),
		subtasks: field.relation({ target: () => Todo, mappedBy: 'parent' }),
		tags: field.relation({ target: () => Tag }),
	}),
})
	.softDelete()
	.acl()
	.with({
		access: {
			read: { where: ({ where }) => where.eq('archived', false) },
			update: {
				where: ({ where }) =>
					where.is('assignee', (user) => user.endsWith('email', '@admin.test')),
			},
			create: true,
			delete: true,
		},
		acl: { default: () => new ACL().grantPublic('read', 'update', 'delete') },
		hooks: {
			beforeOperation: {
				update: ({ item }) => {
					if (item.isDeleted) throw new TypeError('Deleted todos are read-only')
				},
			},
		},
		postgres: { table: 'form_d_todos' },
	})
