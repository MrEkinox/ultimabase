// A rule combined once and shared by several models (D-81). `tsc` fails if
// one does not hold.
import { allOf, anyOf, defineModel, isOwner, signedIn } from '../index.ts'
import { User } from './user.ts'

export const isEditor = signedIn(({ user }) => user.role === 'editor')
export const editorOrAuthor = anyOf(isEditor, isOwner('author'))
export const authorEditor = allOf(isEditor, isOwner('author'))

export const Note = defineModel({
	name: 'Note',
	fields: (f) => ({ text: f.string(), author: f.one(() => User) }),
}).with({ access: { update: editorOrAuthor, delete: authorEditor } })

export const Memo = defineModel({
	name: 'Memo',
	fields: (f) => ({ title: f.string(), author: f.one(() => User) }),
}).with({ access: { update: editorOrAuthor, delete: editorOrAuthor } })

export const NoAuthor = defineModel({
	name: 'NoAuthor',
	fields: (f) => ({ title: f.string() }),
}).with({
	// @ts-expect-error: the model has no `author` relation.
	access: { update: editorOrAuthor },
})
