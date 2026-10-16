import { UltimaBase } from '@ultimabase/core'

import { archivePlugin, auditPlugin } from './plugins.ts'

export const App = UltimaBase.use(auditPlugin(), archivePlugin())

export const Post = App.Schema.define({
	className: 'Post',
	fields: (field) => ({ title: field.string({ required: true }) }),
	archivable: true,
}).with((plugins) => plugins.archiveReason('Outdated').audit(true))

export const Note = App.Schema.define({
	className: 'Note',
	fields: (field) => ({ body: field.string() }),
}).with((plugins) => plugins)

export const Draft = App.Schema.define({
	className: 'Draft',
	fields: (field) => ({ body: field.string() }),
	// @ts-expect-error a rule takes its validator's type
}).with((plugins) => plugins.audit('yes'))
