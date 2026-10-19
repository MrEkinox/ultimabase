import { NoteFactory as App } from './factory.ts'
import { Note } from './note.ts'

export const noteApp = new App({ schemas: [Note] })
