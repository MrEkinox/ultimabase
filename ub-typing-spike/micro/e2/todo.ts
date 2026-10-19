import { define, type Where, type FieldsOf } from '../lib.ts'
import { User } from './user.ts'
export const Todo = define('Todo', (f) => ({ title: f.string(), owner: f.pointerF(() => User) }))
export const w: Where<FieldsOf<typeof Todo>> = { owner: { name: 'x', todo: { title: 'y' } } }
