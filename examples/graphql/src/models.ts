// The models: people, their posts, and each post's revisions, which the API
// reads only through their post.
import { graphql } from '@ultimabase/graphql'
import { allow, defineModel } from 'ultimabase'

//#region person
export const Person = defineModel({
	name: 'Person',
	use: [graphql()],
	fields: (f) => ({ name: f.string(), posts: f.many(() => Post) }),
	// `persons` otherwise: the list field is `people`.
}).with({ access: allow.public, graphql: { plural: 'people' } })
//#endregion

//#region post
export const Post = defineModel({
	name: 'Post',
	use: [graphql()],
	fields: (f) => ({
		title: f.string(),
		slug: f.string({ unique: true }),
		status: f.enumOf(['draft', 'published'], { default: 'draft' }),
		likes: f.number({ integer: true, default: 0 }),
		author: f.one(() => Person),
		revisions: f.many(() => Revision),
	}),
	// A client asks for 20 posts at most in one list.
}).with({ access: allow.public, graphql: { maxTake: 20 } })
//#endregion

//#region revision
export const Revision = defineModel({
	name: 'Revision',
	use: [graphql()],
	fields: (f) => ({ text: f.string(), post: f.one(() => Post) }),
	// No root field: a client reads revisions through their post.
}).with({ access: allow.readOnly, graphql: false })
//#endregion
