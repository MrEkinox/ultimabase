import { defineS } from '../lib.ts'
export const Todo = defineS('Todo', (f) => ({ title: f.string(), owner: f.pointer('User') }), { where: (w) => ({ owner: { name: 'x' } }) })
