import { UltimaBase } from '@ultimabase/core'

// One unfinished define(...) beside a finished declaration, no plugin.
export const App = UltimaBase.use()

export const A = App.Schema.define({
	className: 'A',
	fields: (field) => ({ name: field.string() }),
})

export const B = App.Schema.define({
	className: 'B',
	fields: (field) => ({ name: field.string() }),
}).with({})

export const ultimabase = new App({ schemas: [A, B] })

declare module '@ultimabase/core' {
	interface Register {
		readonly app: typeof ultimabase
	}
}
