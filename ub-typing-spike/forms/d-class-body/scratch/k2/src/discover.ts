import { App } from './app.ts'

// Discoverability probe only (not registered): empty rules object and declaration.
export class Note extends App.Schema.define({ className: 'Note', fields: (field) => ({ body: field.string() }) }) {
	static rules = this.with({  })
}
