import { field, type Where, type FieldsOf } from '../lib.ts'
import { User, defineG } from './user.ts'
export const Todo = defineG('Todo', { title: field.string(), get owner() { return field.pointerT(() => User) } })
export const w: Where<FieldsOf<typeof Todo>> = { owner: { name: 'x', todo: { title: 3 } } }
