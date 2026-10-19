import { App } from './factory.ts'

export const User = App.Schema.declare({
	className: 'User',
	fields: (field) => ({
		displayName: field.string({ required: true }),
		email: field.string({ required: true }),
		assignedTodos: field.relation({ target: 'Todo', mappedBy: 'assignee' }),
		roles: field.relation({ target: 'Role' }),
	}),
}).with({
	access: {
		// Cross-schema filter in this direction; Todo filters on User in the other.
		read: { where: ({ where }) => where.some('assignedTodos', (todo) => todo.eq('archived', false)) },
		update: { where: ({ where, userId }) => where.eq('id', userId ?? '') },
	},
	hooks: {
		beforeSave: ({ item }) => {
			if (item.displayName.trim() === '') throw new TypeError('displayName is empty')
		},
	},
	postgres: { table: 'users' },
})
