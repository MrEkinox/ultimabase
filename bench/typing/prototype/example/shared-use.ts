// One array of `use` entries shared by several models (D-24).
import {
	acl,
	aclPlugin,
	defineApp,
	defineModel,
	graphql,
	graphqlPlugin,
	memory,
	softDelete,
	softDeletePlugin,
	string,
} from '../index.ts'

const common = [softDelete(), acl()]

export const Note = defineModel({
	name: 'Note',
	use: common,
	fields: { body: string() },
}).with({ acl: { ownerField: 'body' } })

export const Memo = defineModel({
	name: 'Memo',
	use: [...common, graphql()],
	fields: { text: string() },
}).with({ acl: { ownerField: 'text' } })

await Note.trash.findMany({ where: { body: 'x' } })
await Memo.trash.findMany({ where: { text: 'x' } })

// @ts-expect-error: graphql is not in Note's `use`.
Note.with({ graphql: {} })
// @ts-expect-error: `ownerField` names a field of Note.
Note.with({ acl: { ownerField: 'text' } })

defineApp({
	database: memory(),
	plugins: [softDeletePlugin(), aclPlugin(), graphqlPlugin()],
	models: [Note, Memo],
})
// @ts-expect-error: Note uses soft delete, missing from `plugins`.
defineApp({ database: memory(), plugins: [aclPlugin()], models: [Note] })
