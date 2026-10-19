import { appS } from '../lib.ts'
import { User } from './user.ts'
import { Todo } from './todo.ts'
export const app = appS([User, Todo])
declare module '../lib.ts' { interface Register { readonly schemas: typeof app.schemas } }
