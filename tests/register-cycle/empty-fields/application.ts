import { UltimaBase } from '@ultimabase/core'

// A single unfinished declaration without fields.
export const App = UltimaBase.use()

export const A = App.Schema.define({ className: 'A', fields: () => ({}) })

export const ultimabase = new App({ schemas: [A] })

declare module '@ultimabase/core' {
	interface Register {
		readonly app: typeof ultimabase
	}
}
