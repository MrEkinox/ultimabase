// The model: posts that a delete keeps, dated, in a trash.
import { graphql } from '@ultimabase/graphql'
import { softDelete } from '@ultimabase/soft-delete'
import { allow, defineModel } from 'ultimabase'

export const Post = defineModel({
	name: 'Post',
	// Adds `deletedAt`, `Post.trash` and `Post.restore`.
	use: [graphql(), softDelete()],
	fields: (f) => ({ title: f.string() }),
	// Open to every client, to keep the example on soft delete.
}).with({ access: allow.public })
