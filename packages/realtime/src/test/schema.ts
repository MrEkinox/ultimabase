// A schema for the unit tests: posts of a team, with comments and tags.
import type { Schema, SchemaField } from 'ultimabase'

const scalar = (name: string): SchemaField => ({
	kind: 'scalar',
	name,
	type: 'string',
	list: false,
	optional: false,
	unique: false,
})

const one = (name: string, target: string, inverse: string): SchemaField => ({
	kind: 'one',
	name,
	target,
	inverse,
	stored: true,
	unique: false,
	optional: false,
	onDelete: 'cascade',
})

const many = (
	name: string,
	target: string,
	inverse: string,
	join = false,
): SchemaField => ({ kind: 'many', name, target, inverse, join })

const model = (name: string, fields: readonly SchemaField[]) => ({
	name,
	fields,
	indexes: [],
})

export const schema: Schema = {
	models: [
		model('Team', [scalar('name'), many('posts', 'Post', 'team')]),
		model('Post', [
			scalar('title'),
			one('team', 'Team', 'posts'),
			many('comments', 'Comment', 'post'),
			many('tags', 'Tag', 'posts', true),
		]),
		model('Comment', [scalar('text'), one('post', 'Post', 'comments')]),
		model('Tag', [scalar('label'), many('posts', 'Post', 'tags', true)]),
	],
}
