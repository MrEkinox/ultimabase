import { base, rules, type Where } from '../lib.ts'
import { User } from './b.ts'
export class Todo extends base('Todo', (f) => ({ title: f.string(), parent: f.pointerF(() => Todo), owner: f.pointerF(() => User) })) {
	static access = rules(Todo, { where: (w) => ({ parent: { title: 'x', parent: { title: 'y' } }, owner: { name: 'n' } }) })
}
export const w: Where<(typeof Todo)['~fields']> = { parent: { title: 'x', parent: { title: 1 } } }
