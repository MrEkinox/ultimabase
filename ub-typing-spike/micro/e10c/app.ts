import { appS2 } from '../lib.ts'
import { User } from './user.ts'
import { Todo } from './todo.ts'
export const app = appS2([User, Todo])
declare module '../lib.ts' { interface Register { readonly schemas: typeof app.schemas } }
