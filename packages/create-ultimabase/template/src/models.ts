// The application's models (D-24): each one a table, its fields and who may
// read and write it.
import { allow, defineModel } from 'ultimabase'

export const Post = defineModel({
	name: 'Post',
	fields: (f) => ({
		title: f.string(),
	}),
	// Anyone may read and write posts; see `allow` for the other rules.
}).with({ access: allow.public })
