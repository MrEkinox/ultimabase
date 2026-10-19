import { bool, pointer, str } from '../common/mini.ts'
import { define } from './core.ts'
import { User } from './user.ts'

// The callbacks need User, whose callbacks need Todo: a cycle that only works because
// `const Todo` is typed from `.with`'s declared return type, without checking the arguments.
export const Todo = define('Todo', () => ({ title: str, archived: bool, assignee: pointer(() => User) }))
	.softDelete()
	.with({
		where: (where) => where.is('assignee', (user) => user.eq('email', 'a@b.c')),
		beforeUpdate: (item) => {
			if (item.isDeleted) throw new TypeError('deleted')
		},
	})
