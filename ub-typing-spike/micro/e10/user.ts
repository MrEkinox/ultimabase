import { defineS } from '../lib.ts'
export const User = defineS('User', (f) => ({ name: f.string(), todo: f.pointer('Todo') }))
