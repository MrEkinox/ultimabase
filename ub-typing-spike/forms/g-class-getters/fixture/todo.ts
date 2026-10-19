import { ACL } from '../lib/plugins.ts'
import { App, field } from './app.ts'
import { TodoPriority } from './priority.ts'
import { Tag } from './tag.ts'
import { TodoUser } from './todo-user.ts'

export class Todo extends App.Schema(
	'Todo',
	{
		title: field.string({ required: true, maxLength: 200 }),
		archived: field.boolean({ default: false }),
		priority: field.enum(TodoPriority, { default: 'normal' }),
		allowedPriorities: field.enum(TodoPriority, { list: true }),
		status: field.enum(['open', 'inProgress', 'done'], { default: 'open' }),
		dueAt: field.date(),
		get assignee() {
			return field.pointer(TodoUser, { onDelete: 'setNull' })
		},
		get parent() {
			return field.pointer(Todo)
		},
		get subtasks() {
			return field.relation(Todo, { mappedBy: 'parent' })
		},
		get tags() {
			return field.relation(Tag)
		},
	},
	{ softDelete: true, postgres: { table: 'todos', indexes: [{ fields: ['archived', 'dueAt'] }] } },
) {
	static access = this.rules.access({
		read: { where: (todo) => todo.eq('archived', false) },
		// Cross-schema filter Todo -> User.
		update: { where: (todo, { userId }) => todo.is('assignee', (user) => user.eq('id', userId ?? '')) },
		delete: { where: () => ({ assignee: { is: { email: { endsWith: '@admin.test' } } } }) },
		create: true,
	})

	static acl = this.rules.acl({
		default: (data) => new ACL().grantRole('TodoRole', 'read', 'update').grantPublic(...(data.title.startsWith('public:') ? (['read'] as const) : [])),
	})

	static hooks = this.rules.hooks({
		beforeUpdate: ({ item }) => {
			if (item.isDeleted) throw new TypeError('Deleted todos are read-only')
		},
		beforeCreate: (data) => ({ ...data, title: data.title.trim() }),
	})
}
