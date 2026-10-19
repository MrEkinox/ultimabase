import { defineS2 } from '../lib.ts'
export const User = defineS2('User', (f) => ({ name: f.string(), todo: f.pointer('Todo') })).with({ where: (w) => ({ todo: { title: 'x' } }) })
