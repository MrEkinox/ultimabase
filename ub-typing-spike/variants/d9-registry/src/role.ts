import { App } from './factory.ts'
import { User } from './user.ts'

export const Role = App.Schema.declare({
	className: 'Role',
	fields: (field) => ({
		name: field.string({ required: true }),
		priority: field.int({ default: 0 }),
		members: field.relation({ target: () => User, mappedBy: 'roles' }),
	}),
}).with({
	access: {
		read: { where: ({ where }) => where.some('members', (user) => user.some('assignedTodos', (todo) => todo.eq('completed', false))) },
		create: false,
	},
})
