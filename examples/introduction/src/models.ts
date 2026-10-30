// The model: posts that clients read once published.
//#region post
import { graphql } from '@ultimabase/graphql'
import { defineModel } from 'ultimabase'

export const Post = defineModel({
	name: 'Post',
	use: [graphql()],
	fields: (f) => ({
		title: f.string(),
		published: f.boolean({ default: false }),
	}),
}).with({
	// Clients read the published posts; the other rules, left out, are
	// closed: only server code writes.
	access: { read: ({ where }) => where({ published: true }) },
})
//#endregion
