import { App } from './app.ts'
import { TodoUser } from './todo-user.ts'

/** Roles of TodoUser, from the Roles factory (ADR-0322); filters through TodoUser (Role -> User). */
export const TodoRole = App.RoleSchema.define({
	className: 'TodoRole',
	members: () => TodoUser,
	fields: (field) => ({ description: field.string() }),
}).with({
	roles: { deletion: 'fail', ensure: ['admin'] },
	access: {
		read: ({ where }) =>
			where.some('members', (user) => user.endsWith('email', '@team.test')),
		create: false,
	},
})
