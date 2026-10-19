import { bool, pointer, str } from '../common/mini.ts'
import { Schema } from './core.ts'
import { User } from './user.ts'

export class Todo extends Schema('Todo', () => ({ title: str, archived: bool, assignee: pointer(() => User) })) {
	static options = this.with({
		where: (where) => where.is('assignee', (user) => user.eq('email', 'a@b.c')),
		beforeUpdate: (item) => {
			if (item.archived) throw new TypeError('archived')
		},
	})
}
