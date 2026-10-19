import { define2 } from '../lib.ts'
import { User } from './user.ts'
export const Todo = define2('Todo', (f) => ({ title: f.string(), owner: f.pointerF(() => User) })).with({ where: (w) => ({ owner: { nam: 'x' } }) })
import type { Where, FieldsOf } from '../lib.ts'
export const bad: Where<FieldsOf<typeof Todo>> = { owner: { name: 'x', todo: { title: 1 } } }
