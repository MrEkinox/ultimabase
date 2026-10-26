// The models: posts and their authors, served by both transports.
import { graphql } from '@ultimabase/graphql'
import { rest } from '@ultimabase/rest'
import { allow, defineModel } from 'ultimabase'

export const Author = defineModel({
	name: 'Author',
	use: [graphql(), rest()],
	fields: (f) => ({ name: f.string(), posts: f.many(() => Post) }),
	// Open to every client, to keep the example on the transports.
}).with({ access: allow.public })

export const Post = defineModel({
	name: 'Post',
	use: [graphql(), rest()],
	fields: (f) => ({
		title: f.string(),
		likes: f.number({ default: 0 }),
		author: f.one(() => Author),
	}),
}).with({ access: allow.public })
