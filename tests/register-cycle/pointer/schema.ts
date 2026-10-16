import { UltimaBase } from '@ultimabase/core'

// An unfinished declaration pointing to a finished one, across files.
export const App = UltimaBase.use()

export const A = App.Schema.define({
	className: 'A',
	fields: (field) => ({
		name: field.string(),
		b: field.pointer({ target: () => B }),
	}),
})

export const B = App.Schema.define({
	className: 'B',
	fields: (field) => ({ name: field.string() }),
}).with((plugins) => plugins)
