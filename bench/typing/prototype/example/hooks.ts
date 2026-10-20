// What the application's hooks receive and return (D-15, D-43, D-71). `tsc`
// fails if one does not hold.
import { defineModel, PublicError } from '../index.ts'

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
		// A `before*` hook refuses by throwing; a `PublicError` reaches the
		// client with its code, an application's own (D-72).
		beforeUpdate: ({ record, data }) => {
			if (record.locked)
				throw new PublicError('DOCUMENT_LOCKED', 'This document is locked.')
			if (data.title !== undefined) data.title = data.title.trim()
		},
		beforeDelete: ({ record }) => {
			if (record.status === 'published')
				throw new PublicError('DOCUMENT_PUBLISHED', 'Archive it first.')
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

// A kernel code keeps its meaning, and its status, when the application
// throws it (D-72).
export const missing = new PublicError('NOT_FOUND', 'No such document.')
export const tooShort = new PublicError('VALIDATION_FAILED', 'Too short.', {
	details: { issues: [{ path: ['title'], message: 'At least 3 letters.' }] },
})
export const withDetails = new PublicError('QUOTA_REACHED', 'Upgrade.', {
	details: { limit: 10 },
})
// Any other error reaches the client as `INTERNAL`.
export const masked = new Error('Connection refused.')

// @ts-expect-error: a code is written in capitals.
export const lowercase = new PublicError('documentLocked', 'Locked.')
export const noIssues = new PublicError('VALIDATION_FAILED', 'Too short.', {
	// @ts-expect-error: `VALIDATION_FAILED` details list the issues.
	details: { title: 'At least 3 letters.' },
})
export const notJson = new PublicError('QUOTA_REACHED', 'Upgrade.', {
	// @ts-expect-error: details are sent as JSON.
	details: { at: new Date() },
})

// The code stays typed where the error is caught.
export function codeOf(error: unknown): number {
	// @ts-expect-error: a caught error's code is a string, not `any`.
	return error instanceof PublicError ? error.code : 0
}
