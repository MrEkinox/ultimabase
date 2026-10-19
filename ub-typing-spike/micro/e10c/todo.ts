import { defineS2, type WhereS2, type FieldsOf } from '../lib.ts'
export const Todo = defineS2('Todo', (f) => ({ title: f.string(), owner: f.pointer('User') })).with({ where: (w) => ({ owner: { name: 'x' } }) })
export const w: WhereS2<FieldsOf<typeof Todo>> = { owner: { name: 'x', todo: { title: 'y' } } }
export const bad: WhereS2<FieldsOf<typeof Todo>> = { owner: { name: 'x', todo: { title: 1 } } }
