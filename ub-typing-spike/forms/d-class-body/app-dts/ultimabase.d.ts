import { Tag } from './tag.ts';
import { Todo } from './todo.ts';
import { TodoRole } from './todo-role.ts';
import { TodoUser } from './todo-user.ts';
export declare const ultimabase: import("@ultimabase/core").Application<readonly [typeof TodoUser, typeof TodoRole, typeof Todo, typeof Tag]>;
declare module '@ultimabase/core' {
    interface Register {
        readonly app: typeof ultimabase;
    }
}
