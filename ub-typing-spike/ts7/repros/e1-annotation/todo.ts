import { bool, pointer, str, type Rules } from '../common/mini.ts'
import { Schema } from './core.ts'
import { User } from './user.ts'

export class Todo extends Schema('Todo', () => ({ title: str, archived: bool, assignee: pointer(() => User) })) {
	static readonly options: Rules<typeof Todo> = {
		where: (where) => where.is('assignee', (user) => user.eq('email', 'a@b.c')),
		beforeUpdate: (item) => {
			if (item.archived) throw new TypeError('archived')
		},
	}
}
