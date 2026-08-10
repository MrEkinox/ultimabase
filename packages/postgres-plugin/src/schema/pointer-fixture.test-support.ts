import { Schema, SchemaRegistry } from '@ultimabase/core'
import type { SchemaDefinition, SchemaTargetGraph } from '@ultimabase/core'

import { PostgresSchemaCatalog } from './catalog.js'

const User: SchemaDefinition = Schema.define({
	className: 'PointerUser',
	fields: (field) => ({ name: field.string() }),
})
const Post: SchemaDefinition = Schema.define({
	className: 'PointerPost',
	fields: (field) => ({
		author: field.pointer({
			indexed: 'unique',
			onDelete: 'cascade',
			target: 'PointerUser',
			validation: { required: true },
		}),
	}),
})

interface PostgresPointerFixture {
	readonly catalog: PostgresSchemaCatalog
	readonly Post: typeof Post
	readonly targets: SchemaTargetGraph
	readonly User: typeof User
}

/** Creates one closed logical graph shared by PostgreSQL pointer unit tests. */
export const createPostgresPointerFixture = (): PostgresPointerFixture => {
	const registry = new SchemaRegistry([User, Post])
	const targets = registry.resolveSchemaTargets()
	const catalog = new PostgresSchemaCatalog(registry.values(), targets)

	return { catalog, Post, targets, User }
}
