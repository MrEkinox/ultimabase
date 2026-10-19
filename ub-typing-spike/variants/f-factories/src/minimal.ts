// A second factory with only the access plugin: its schemas offer `.access()` only.
import { UltimaBase } from '../../../lib-f/core.ts'
import { accessPlugin } from '../../../lib-f/plugins.ts'

export const MiniApp = UltimaBase.use(accessPlugin())

export const Note = MiniApp.Schema.define({ className: 'Note', fields: (field) => ({ body: field.string() }) })
	.access({ read: true })
