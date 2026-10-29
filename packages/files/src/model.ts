// `FilesBlob` (D-152): one row for each object in the storage, a file or one
// of its variants. Its row is the truth; a file field stores a copy.
import type { Field, ModelOf, ScalarOptions } from 'ultimabase'
import { defineModel, master } from 'ultimabase'
import { runningOf } from './values.ts'

export const M: { readonly as: typeof master } = { as: master }

/** One hour, a pending blob's life. */
export const hour: number = 60 * 60 * 1000

/** A blob's state: uploaded, held by a row, or to delete. */
export type BlobState = 'pending' | 'attached' | 'released'

type Optional<V> = Field<V | null, { readonly optional: true }>

type BlobFields = {
	/** `public/…` or `private/…`, the object's key in the storage. */
	readonly key: Field<string, { readonly unique: true }>
	/** The file's name; a variant's own, `thumb`. */
	readonly name: Field<string, ScalarOptions<string>>
	readonly type: Field<string, ScalarOptions<string>>
	readonly size: Field<number, { readonly integer: true }>
	/** `Post.cover`. */
	readonly field: Field<string, ScalarOptions<string>>
	/** The uploading user's id, `master`, or `null` for an anonymous caller. */
	readonly uploadedBy: Optional<string>
	readonly state: Field<string, ScalarOptions<string>>
	/** `Post.cover:<id>`, once attached. */
	readonly attachedTo: Optional<string>
	/** A variant's file. */
	readonly variantOf: Optional<string>
	readonly inline: Field<
		unknown,
		{ readonly optional: true },
		never,
		never,
		unknown,
		true
	>
	/** When a pending blob expires. */
	readonly deleteAfter: Optional<Date>
}

export const FilesBlob: ModelOf<'FilesBlob', BlobFields, []> = defineModel({
	name: 'FilesBlob',
	fields: (f) => ({
		key: f.string({ unique: true }),
		name: f.string(),
		type: f.string(),
		size: f.number({ integer: true }),
		field: f.string(),
		uploadedBy: f.string({ optional: true }),
		state: f.string(),
		attachedTo: f.string({ optional: true }),
		variantOf: f.string({ optional: true }),
		inline: f.json({ optional: true }),
		deleteAfter: f.dateTime({ optional: true }),
	}),
	indexes: [
		{ fields: ['state', 'deleteAfter'] },
		{ fields: ['variantOf'] },
		{ fields: ['attachedTo'] },
	],
	// An upload creates its row as its caller: the kernel gives the rule the
	// whole caller, and Master always passes. The rest stays Master's.
}).with({ access: { create: ({ caller }) => runningOf().upload({ caller }) } })
