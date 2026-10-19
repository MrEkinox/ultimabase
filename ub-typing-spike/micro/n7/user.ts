import { base, rules } from '../lib.ts'
import { Todo } from './todo.ts'
export class User extends base('User', (f) => ({ name: f.string(), todo: f.pointerF(() => Todo) })) {
	static access = rules(User, { where: (w) => ({ todo: { titl: 'x' } }) })
}
