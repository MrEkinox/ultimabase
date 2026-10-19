// Runtime stub of form K': registers the fixture (which seals the schemas), prints what the
// application collected, runs a few rules, then shows the statement-specific failures.
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

const attempt = async (label, run) => {
	try {
		await run()
		console.log(`\n### ${label}: accepted`)
	} catch (error) {
		console.log(`\n### ${label}: ${error.name}\n${error.message}`)
	}
}
console.log('\n## Statement-specific checks')
console.log(`\nTag rules after registration: ${Object.keys(rulesOf('Tag')).join(', ')} (tag-extra-rules.ts never imported: its hooks are silently absent)`)
await attempt("K'a statement after registration (Todo.acl)", () => Todo.acl({ default: () => null }))
await attempt("K'b late import of a rules module after registration", () => import('./fixture/src/tag-extra-rules.ts'))
const Note = App.Schema.define({ className: 'Note', fields: (field) => ({ body: field.string() }) })
Note.access({ read: true })
await attempt("K'c same statement twice before registration", () => Note.access({ read: false }))
await attempt("K'd unknown statement (no plugin method)", () => Note.acess({ read: true }))
await attempt("K'e schema registered in a second application (tests)", () => new App({ schemas: [TodoUser, TodoRole, Todo, Tag] }))
await attempt("K'f second RoleSchema", () => new App({ schemas: [TodoUser, TodoRole, Todo, Tag, StaffRole] }))
