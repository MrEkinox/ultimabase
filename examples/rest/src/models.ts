// The models: people, their posts, and each post's revisions, which the API
// reads only through their post. GraphQL serves them too, with the same
// names and answers.
//#region post
import { graphql } from '@ultimabase/graphql'
import { rest } from '@ultimabase/rest'
import { allow, defineModel } from 'ultimabase'

export const Post = defineModel({
	name: 'Post',
	use: [rest(), graphql()],
	fields: (f) => ({
		title: f.string(),
		slug: f.string({ unique: true }),
		status: f.enumOf(['draft', 'published'], { default: 'draft' }),
		likes: f.number({ integer: true, default: 0 }),
		publishedAt: f.dateTime({ optional: true }),
		author: f.one(() => Person),
		revisions: f.many(() => Revision),
	}),
	// A client asks for 20 posts at most in one list.
}).with({ access: allow.public, rest: { maxTake: 20 } })
//#endregion

//#region person
export const Person = defineModel({
	name: 'Person',
	use: [rest(), graphql()],
	fields: (f) => ({ name: f.string(), posts: f.many(() => Post) }),
	// `persons` otherwise: the route is /api/people.
}).with({
	access: allow.public,
	rest: { plural: 'people' },
	graphql: { plural: 'people' },
})
//#endregion

//#region revision
export const Revision = defineModel({
	name: 'Revision',
	use: [rest(), graphql()],
	fields: (f) => ({ text: f.string(), post: f.one(() => Post) }),
	// No route: a client reads revisions through their post.
}).with({ access: allow.readOnly, rest: false, graphql: false })
//#endregion
