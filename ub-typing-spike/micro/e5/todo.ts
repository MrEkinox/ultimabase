import { defineThis, type Where, type FieldsOf } from '../lib.ts'
import { User } from './user.ts'
export const Todo = defineThis('Todo', (f) => ({ title: f.string(), owner: f.pointerF(() => User) }), { filter() { const x: typeof this.where = { owner: { name: 'x', todo: { title: 'z' } } }; return x } })
export const w: Where<FieldsOf<typeof Todo>> = { owner: { name: 'x', todo: { title: 'y' } } }
