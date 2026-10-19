import { defineVoid, type Where, type FieldsOf } from '../lib.ts'
import { User } from './user.ts'
export const Todo = defineVoid('Todo', (f) => ({ title: f.string(), owner: f.pointerF(() => User) }), { beforeSave: (r) => { const n: string | undefined = r.owner?.name; void n } })
export const w: Where<FieldsOf<typeof Todo>> = { owner: { name: 'x', todo: { title: 'y' } } }
