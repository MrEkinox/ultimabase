import { pointer, str, type Rules } from '../common/mini.ts'
import { Schema } from './core.ts'
import { Todo } from './todo.ts'

export class User extends Schema('User', () => ({ email: str, lastTodo: pointer(() => Todo) })) {
	static readonly options: Rules<typeof User> = { where: (where) => where.is('lastTodo', (todo) => todo.eq('archived', false)) }
}
