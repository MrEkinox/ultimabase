import {
	pointerField,
	Schema,
	SchemaRegistry,
	stringField,
} from '@ultimabase/core'
import type { SchemaDefinition, SchemaTargetGraph } from '@ultimabase/core'

import { PostgresSchemaCatalog } from './catalog.js'

const User: SchemaDefinition = Schema.define({
	className: 'PointerUser',
	fields: { name: stringField() },
})
const Post: SchemaDefinition = Schema.define({
	className: 'PointerPost',
	fields: {
		author: pointerField({
			indexed: 'unique',
			onDelete: 'cascade',
			target: () => User,
			validation: { required: true },
		}),
	},
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
