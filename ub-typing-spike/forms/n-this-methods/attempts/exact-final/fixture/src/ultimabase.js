import { AdminRole } from './extra.ts';
import { App } from './app.ts';
import { Tag } from './tag.ts';
import { Todo } from './todo.ts';
import { TodoRole } from './todo-role.ts';
import { TodoUser } from './todo-user.ts';
void AdminRole;
export const ultimabase = new App({ schemas: [TodoUser, TodoRole, Todo, Tag] });
// Register line OFF (see attempts/): Register + rules in the generic call = type cycle (E10).
// declare module '@ultimabase/core' {
// 	interface Register {
// 		readonly app: typeof ultimabase
// 	}
// }
