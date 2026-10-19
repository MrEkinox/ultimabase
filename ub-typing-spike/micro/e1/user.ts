import { define } from '../lib.ts'
import { Todo } from './todo.ts'
export const User = define('User', (f) => ({ name: f.string(), todo: f.pointerT(() => Todo) }))
