import type { ACL } from '../../../lib-f/plugins.ts'
import { App } from './factory.ts'
import { Tag } from './tag.ts'
import { User } from './user.ts'

declare const publicReadAcl: ACL

export const Todo = App.Schema.define({
	className: 'Todo',
	fields: (field) => ({
		title: field.string({ required: true }),
		completed: field.boolean({ required: true, default: false }),
		archived: field.boolean({ required: true, default: false }),
		priority: field.enum({ values: ['low', 'normal', 'high'], default: 'normal' }),
		dueAt: field.date(),
		assignee: field.pointer({ target: () => User, onDelete: 'setNull' }),
		parent: field.pointer({ target: () => Todo }),
		subtasks: field.relation({ target: () => Todo, mappedBy: 'parent' }),
		tags: field.relation({ target: () => Tag }),
	}),
})
	.softDelete()
	.indexes([{ fields: ['completed', 'dueAt'] }])
	.postgres({ table: 'todos' })
	.acl({ default: (data) => (data.title.startsWith('public:') ? publicReadAcl : publicReadAcl.grantPublic('read')) })
	.hooks({
		beforeSave: ({ item, originalItem }) => {
			if (originalItem?.completed === true && !item.completed) throw new TypeError('cannot reopen')
			if (item.isDeleted) throw new TypeError('deleted')
		},
		beforeCreate: (data) => ({ ...data, title: data.title.trim() }),
	})
	.access({
		read: { where: ({ where }) => where.eq('archived', false) },
		update: { where: ({ where, userId }) => where.is('assignee', (user) => user.eq('id', userId ?? '')) },
		create: false,
		delete: { where: () => ({ assignee: { is: { email: { endsWith: '@admin.test' } } } }) },
	})
