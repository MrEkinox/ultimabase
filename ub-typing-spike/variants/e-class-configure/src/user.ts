import { App } from './factory.ts'
import { Role } from './role.ts'
import { Todo } from './todo.ts'

export class User extends App.Schema('User', (field) => ({
	displayName: field.string({ required: true }),
	email: field.string({ required: true }),
	assignedTodos: field.relation({ target: () => Todo, mappedBy: 'assignee' }),
	roles: field.relation({ target: () => Role }),
})) {
	static readonly options = User.configure({
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
}
