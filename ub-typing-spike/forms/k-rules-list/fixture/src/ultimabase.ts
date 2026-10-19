import { App } from './app.ts'
import { Tag, tagRules } from './tag.ts'
import { Todo, todoRules } from './todo.ts'
import { TodoRole, todoRoleRules } from './todo-role.ts'
import { TodoUser, todoUserRules } from './todo-user.ts'

export const ultimabase = new App({
	schemas: [TodoUser, TodoRole, Todo, Tag],
	rules: [todoUserRules, todoRoleRules, todoRules, tagRules],
})
