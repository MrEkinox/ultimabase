// Two models: an author and the posts they write, each post's slug unique.
import { defineModel } from 'ultimabase'

export const Author = defineModel({
	name: 'Author',
	fields: (f) => ({ name: f.string(), posts: f.many(() => Post) }),
})

export const Post = defineModel({
	name: 'Post',
	fields: (f) => ({
		slug: f.string({ unique: true }),
		views: f.number({ integer: true, default: 0 }),
		author: f.one(() => Author),
	}),
})
