// Runtime stub of form K: registers the fixture, prints what the application collected,
// runs a few rules, then shows every startup error of the rules list.
// Usage: node runtime-check.mjs   (Node >= 23.6 strips the fixture's TypeScript types)
import { App } from './fixture/src/app.ts'
import { StaffRole, staffRoleRules } from './fixture/src/extra.ts'
import { Tag, tagRules } from './fixture/src/tag.ts'
import { Todo, todoRules } from './fixture/src/todo.ts'
import { TodoRole, todoRoleRules } from './fixture/src/todo-role.ts'
import { TodoUser, todoUserRules } from './fixture/src/todo-user.ts'
import { ultimabase } from './fixture/src/ultimabase.ts'

const show = (value) => JSON.stringify(value, (key, v) => (typeof v === 'function' ? `[function ${v.name || key}]` : key === 'schema' ? undefined : v))

console.log('## Registered application')
for (const entry of ultimabase.registration) {
	console.log(`\n### ${entry.className}${entry.factory ? ` (factory ${entry.factory})` : ''}`)
	console.log(`fields: ${show(entry.fields)}`)
	console.log(`shape options: ${show(entry.shape)}`)
	for (const [key, rule] of Object.entries(entry.rules)) console.log(`rule ${key} (plugin ${rule.plugin}): ${show(rule.value)}`)
}

// A recording WhereBuilder: proves the rule callbacks are executable data.
const builder = (schema) => ({
	eq: (field, value) => ({ [schema]: { [field]: { eq: value } } }),
	is: (field, target) => ({ [schema]: { [field]: { is: target(builder(field)) } } }),
	some: (field, target) => ({ [schema]: { [field]: { some: target(builder(field)) } } }),
})
const rulesOf = (name) => ultimabase.registration.find((entry) => entry.className === name).rules
console.log('\n## Executing rules')
console.log('Todo access.update filter:', show(rulesOf('Todo').access.value.update.where({ where: builder('Todo'), userId: 'u1' })))
console.log('Tag access.read filter (two hops):', show(rulesOf('Tag').access.value.read.where({ where: builder('Tag'), userId: 'u1' })))
try {
	rulesOf('Todo').hooks.value.beforeUpdate({ item: { isDeleted: true }, originalItem: null })
} catch (error) {
	console.log('Todo hooks.beforeUpdate on a deleted item throws:', error.message)
}
console.log('TodoUser.displayName resolveInput("  Ann "):', JSON.stringify(TodoUser.fields.displayName.options.hooks.resolveInput({ value: '  Ann ' })))
console.log('Todo.title validate(201 chars):', Todo.fields.title.options.validate('x'.repeat(201)))

const attempt = (label, create) => {
	try {
		create()
		console.log(`\n### ${label}: accepted`)
	} catch (error) {
		console.log(`\n### ${label}: ${error.name}\n${error.message}`)
	}
}
const schemas = [TodoUser, TodoRole, Todo, Tag]
console.log('\n## Startup checks of the rules list')
attempt('K1 rules forgotten (tagRules missing)', () => new App({ schemas, rules: [todoUserRules, todoRoleRules, todoRules] }))
attempt('K2 rules listed twice', () => new App({ schemas, rules: [todoUserRules, todoRoleRules, todoRules, tagRules, todoRules] }))
attempt('K3 rules without their schema (Tag missing from schemas)', () => new App({ schemas: [TodoUser, TodoRole, Todo], rules: [todoUserRules, todoRoleRules, todoRules, tagRules] }))
attempt('K4 second RoleSchema', () => new App({ schemas: [...schemas, StaffRole], rules: [todoUserRules, todoRoleRules, todoRules, tagRules, staffRoleRules] }))
attempt('K4b no RoleSchema at all', () => new App({ schemas: [TodoUser, Todo, Tag], rules: [todoUserRules, todoRules, tagRules] }))
attempt('K5 unknown rule key at declaration', () => Todo.rules({ acess: {} }))
attempt('K6 unknown shape option at define', () => App.Schema.define({ className: 'X', sofDelete: true, fields: () => ({}) }))
attempt('K7 schema undefined (import cycle evaluated new App first)', () => new App({ schemas: [undefined, ...schemas], rules: [todoUserRules, todoRoleRules, todoRules, tagRules] }))
// Last: a second rules declaration for Todo stays recorded on the schema.
const extraTodoRules = Todo.rules({ hooks: {} })
attempt('K8 Todo.rules(...) declared but not listed (and also duplicate if listed)', () => new App({ schemas, rules: [todoUserRules, todoRoleRules, todoRules, tagRules] }))
void extraTodoRules
