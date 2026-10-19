import { pointer, str } from '../common/mini.ts'
import { define } from './core.ts'
import { Todo } from './todo.ts'

export const User = define('User', () => ({ email: str, lastTodo: pointer(() => Todo) }))
export const userRules = User.rules({ where: (where) => where.is('lastTodo', (todo) => todo.eq('archived', false)) })
