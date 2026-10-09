import { App } from './app.ts'
import { TodoUser } from './todo-user.ts'

export const Todo = App.Schema.define({
	className: 'Todo',
	fields: (field) => ({
		title: field.string({ required: true }),
		archived: field.boolean({ required: true, default: false }),
		assignee: field.pointer({ target: () => TodoUser, onDelete: 'setNull' }),
		parent: field.pointer({ target: () => Todo }),
		subtasks: field.relation({ target: () => Todo, mappedBy: 'parent' }),
	}),
})
	.softDelete()
	.with({
		access: {
			read: { where: ({ where }) => where.eq('archived', false) },
			update: {
				where: ({ where }) =>
					where.is('assignee', (user) => user.endsWith('email', '@admin.test')),
			},
		},
		hooks: {
			beforeOperation: {
				update: ({ item }) => {
					if (item.isDeleted) throw new TypeError('Deleted todos are read-only')
				},
			},
		},
	})
