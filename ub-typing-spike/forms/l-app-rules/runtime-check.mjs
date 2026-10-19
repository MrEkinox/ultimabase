// Runtime stub of form L: registers the fixture, prints what the application collected,
// runs a few rules, then shows the startup checks of the application-level rules.
// Usage: node runtime-check.mjs   (Node >= 23.6 strips the fixture's TypeScript types)
import { App } from './fixture/src/app.ts'
import { StaffRole } from './fixture/src/extra.ts'
import { Tag } from './fixture/src/tag.ts'
import { Todo } from './fixture/src/todo.ts'
import { TodoRole } from './fixture/src/todo-role.ts'
import { TodoUser } from './fixture/src/todo-user.ts'
import { ultimabase } from './fixture/src/ultimabase.ts'

const show = (value) => JSON.stringify(value, (key, v) => (typeof v === 'function' ? `[function ${v.name || key}]` : key === 'schema' ? undefined : v))

console.log('## Registered application')
for (const entry of ultimabase.registration) {
	console.log(`\n### ${entry.className}${entry.factory ? ` (factory ${entry.factory})` : ''}`)
	console.log(`fields: ${show(entry.fields)}`)
	console.log(`shape options: ${show(entry.shape)}`)
	for (const [key, rule] of Object.entries(entry.rules)) console.log(`rule ${key} (plugin ${rule.plugin}): ${show(rule.value)}`)
}

const builder = (schema) => ({
	eq: (field, value) => ({ [schema]: { [field]: { eq: value } } }),
	is: (field, target) => ({ [schema]: { [field]: { is: target(builder(field)) } } }),
	some: (field, target) => ({ [schema]: { [field]: { some: target(builder(field)) } } }),
})
const rulesOf = (name) => ultimabase.registration.find((entry) => entry.className === name).rules
console.log('\n## Executing rules')
console.log('Todo access.update filter:', show(rulesOf('Todo').access.value.update.where({ where: builder('Todo'), userId: 'u1' })))
try {
	rulesOf('Todo').hooks.value.beforeUpdate({ item: { isDeleted: true }, originalItem: null })
} catch (error) {
	console.log('Todo hooks.beforeUpdate on a deleted item throws:', error.message)
}

const attempt = (label, create) => {
	try {
		create()
		console.log(`\n### ${label}: accepted`)
	} catch (error) {
		console.log(`\n### ${label}: ${error.name}\n${error.message}`)
	}
}
const schemas = [TodoUser, TodoRole, Todo, Tag]
console.log('\n## Startup checks of the application rules')
attempt('L1 class name typo as rules key', () => new App({ schemas, rules: { Todoo: { access: { read: true } } } }))
attempt('L2 rules for a schema missing from schemas', () => new App({ schemas: [TodoUser, TodoRole, Todo], rules: { Tag: { access: { read: true } } } }))
attempt('L3 rules entry forgotten (no rules at all)', () => new App({ schemas }))
attempt('L4 second RoleSchema', () => new App({ schemas: [...schemas, StaffRole] }))
attempt('L5 unknown rule key', () => new App({ schemas, rules: { Todo: { acess: {} } } }))
