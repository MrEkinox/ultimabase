//#region imports
import { App } from './app.ts'
//#endregion imports

//#region post
export const Post = App.Schema.define({
	className: 'Post',
	fields: (f) => ({ title: f.string({ required: true }) }),
	archivable: true,
}).with({
	audit: true,
	rest: { archiveOne: true },
	graphql: { archiveOne: true },
})
//#endregion post

//#region comment
export const Comment = App.Schema.define({
	className: 'Comment',
	fields: (f) => ({ body: f.string({ required: true }) }),
	flaggable: true,
}).with({ flagReason: 'Reported by a reader' })
//#endregion comment
