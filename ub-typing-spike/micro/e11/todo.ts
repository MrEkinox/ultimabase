import { define11 } from '../lib.ts'
import { User } from './user.ts'
export const Todo = define11('Todo', (f) => ({ title: f.string(), owner: f.pointerF(() => User) }), () => ({ where: (w) => ({ owner: { name: 'x' } }) }))
