import { define2 } from '../lib.ts'
import { User } from './user.ts'
export const Todo = define2('Todo', (f) => ({ title: f.string(), owner: f.pointerF(() => User) })).with({ where: (w) => ({ owner: { name: 'x' } }) })
