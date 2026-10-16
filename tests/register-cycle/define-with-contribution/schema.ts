import { accessPlugin } from '@ultimabase/access-plugin'
import { UltimaBase } from '@ultimabase/core'
import { hooksPlugin } from '@ultimabase/hooks-plugin'
import { restPlugin } from '@ultimabase/rest-plugin'
import { softDeletePlugin } from '@ultimabase/soft-delete-plugin'

export const App = UltimaBase.use(
	accessPlugin(),
	hooksPlugin(),
	softDeletePlugin(),
	restPlugin(),
)

export const Author = App.Schema.define({
	className: 'Author',
	fields: (field) => ({ name: field.string({ required: true }) }),
})

// The contributions target a schema with a Soft Delete command, a pointer, a
// unique field and a unique index (ADR-0332), all typed from `Post` itself.
export const Post = App.Schema.define({
	className: 'Post',
	fields: (field) => ({
		title: field.string({ required: true }),
		slug: field.string({ indexed: 'unique', required: true }),
		published: field.boolean({ default: false, required: true }),
		author: field.pointer({ target: () => Author }),
	}),
	softDelete: { mode: 'command' },
	indexes: [{ fields: ['author', 'title'], unique: true }],
}).with({
	access: { read: true, softDeleteOne: true },
	hooks: {
		afterOperation: { update: ({ changes, item }) => void [changes, item] },
	},
	rest: { softDeleteOne: true },
})
