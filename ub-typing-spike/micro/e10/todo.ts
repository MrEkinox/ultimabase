import { defineS, type WhereS, type FieldsOf } from '../lib.ts'
export const Todo = defineS('Todo', (f) => ({ title: f.string(), owner: f.pointer('User') }))
export const w: WhereS<FieldsOf<typeof Todo>> = { owner: { name: 'x', todo: { title: 'y' } } }
