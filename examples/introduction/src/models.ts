// The model: posts that clients read once published.
//#region post
import { defineModel } from 'ultimabase'

export const Post = defineModel({
	name: 'Post',
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
