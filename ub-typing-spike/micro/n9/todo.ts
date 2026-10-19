import { define9, app9, type Where, type FieldsOf } from '../lib.ts'
import { User } from './user.ts'
export const Todo = define9('Todo', (f) => ({ title: f.string(), owner: f.pointerF(() => User) }), { where: (w) => ({ owner: { nme: 'x' } }) })
export const w: Where<FieldsOf<typeof Todo>> = { owner: { name: 'x', todo: { title: 'y' } } }
export const app = app9([User, Todo])
