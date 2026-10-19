import { bool, pointer, str } from '../common/mini.ts'
import { define } from './core.ts'
import { User } from './user.ts'

export const Todo = define('Todo', () => ({ title: str, archived: bool, assignee: pointer(() => User) }))
export const todoRules = Todo.rules({
	where: (where) => where.is('assignee', (user) => user.eq('email', 'a@b.c')),
	beforeUpdate: (item) => {
		if (item.archived) throw new TypeError('archived')
	},
})
