import { base, rules, type Where } from '../lib.ts'
import { User } from './user.ts'
export class Todo extends base('Todo', (f) => ({ title: f.string(), owner: f.pointerF(() => User) })) {
	static access = rules(Todo, { where: (w) => ({ owner: { name: 'x', todo: { title: 2 } } }) })
}
export const w: Where<(typeof Todo)['~fields']> = { owner: { name: 'x', todo: { title: 'y' } } }
