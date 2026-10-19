// Schema module that imports the application instance (e.g. to use it in a hook): import cycle.
import { NoteFactory as App } from './factory.ts'
import { noteApp } from './note-app.ts'

export const Note = App.Schema.define({ className: 'Note', fields: (field) => ({ body: field.string() }) })

Note.hooks({ beforeSave: () => void noteApp })
