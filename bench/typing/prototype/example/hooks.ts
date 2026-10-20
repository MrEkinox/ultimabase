// What the application's hooks receive and return (D-15, D-43, D-71). `tsc`
// fails if one does not hold.
import { defineModel } from '../index.ts'

export const Doc = defineModel({
	name: 'Doc',
	fields: (f) => ({
		title: f.string(),
		status: f.enumOf(['draft', 'published', 'archived']),
		locked: f.boolean({ default: false }),
	}),
}).with({
	hooks: {
		// Archived documents do not exist for any caller, Master included.
		beforeFind: ({ where }) => where({ status: { not: 'archived' } }),
		// A `before*` hook changes the data in place.
		beforeCreate: ({ data }) => {
			data.title = data.title.trim()
		},
		// A `before*` hook refuses by throwing.
		beforeUpdate: ({ record, data }) => {
			if (record.locked) throw new Error('This document is locked.')
			if (data.title !== undefined) data.title = data.title.trim()
		},
		beforeDelete: ({ record }) => {
			if (record.status === 'published') throw new Error('Archive it first.')
		},
		afterUpdate: ({ record, previous }) => {
			const published =
				previous.status !== 'published' && record.status === 'published'
			void published
		},
	},
})

Doc.with({
	hooks: {
		// @ts-expect-error: a filter only comes from `where`.
		beforeFind: () => ({ status: 'draft' }),
	},
})
Doc.with({
	hooks: {
		// @ts-expect-error: `statuss` is not a field of Doc.
		beforeFind: ({ where }) => where({ statuss: 'draft' }),
	},
})
Doc.with({
	hooks: {
		beforeCreate: ({ data }) => {
			// @ts-expect-error: `title` is a string.
			data.title = 42
			// @ts-expect-error: `titel` is not a field of Doc.
			data.titel = 'x'
		},
	},
})
Doc.with({
	hooks: {
		// @ts-expect-error: a created record has no previous version.
		afterCreate: ({ previous }) => {
			void previous
		},
	},
})
Doc.with({
	hooks: {
		// @ts-expect-error: `afterFind` is not a hook (D-71).
		afterFind: () => undefined,
	},
})
