import { Pointer, SchemaRegistry, UltimaBase } from '@ultimabase/core'
import type { SchemaDefinition, SchemaTargetGraph } from '@ultimabase/core'

import { PostgresSchemaCatalog } from './catalog.js'

// Schema classes create their own Pointers (ADR-0314).
const userSchema = UltimaBase.Schema.define({
	className: 'PointerUser',
	fields: (field) => ({ name: field.string() }),
})
const postSchema = UltimaBase.Schema.define({
	className: 'PointerPost',
	fields: (field) => ({
		author: field.pointer({
			indexed: 'unique',
			onDelete: 'cascade',
			target: 'PointerUser',
			required: true,
		}),
	}),
})

const User: SchemaDefinition = userSchema
const Post: SchemaDefinition = postSchema

// Schemas create their own Pointers (ADR-0314); tests read them erased.
const readPointer = (value: unknown): Pointer => {
	if (!Pointer.is(value)) throw new TypeError('Expected a Pointer')
	return value
}

interface PostgresPointerFixture {
	readonly catalog: PostgresSchemaCatalog
	readonly Post: typeof Post
	readonly targets: SchemaTargetGraph
	readonly User: typeof User
	readonly postPointer: (id: string) => Pointer
	readonly userPointer: (id: string) => Pointer
}

/** Creates one closed logical graph shared by PostgreSQL pointer unit tests. */
export const createPostgresPointerFixture = (): PostgresPointerFixture => {
	const registry = new SchemaRegistry([User, Post])
	const targets = registry.resolveSchemaTargets()
	const catalog = new PostgresSchemaCatalog(registry.values(), targets)

	return {
		catalog,
		Post,
		postPointer: (id) => readPointer(postSchema.pointer(id)),
		targets,
		User,
		userPointer: (id) => readPointer(userSchema.pointer(id)),
	}
}
