import { pointer, str } from '../common/mini.ts'
import { Schema } from './core.ts'
import { Todo } from './todo.ts'

export class User extends Schema('User', () => ({ email: str, lastTodo: pointer(() => Todo) })) {
	static options = this.with({ where: (where) => where.is('lastTodo', (todo) => todo.eq('archived', false)) })
}
