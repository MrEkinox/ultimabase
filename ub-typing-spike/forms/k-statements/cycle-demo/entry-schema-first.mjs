// Entry imports the schema module first: note-app.ts is evaluated before note.ts finishes.
import { Note } from './note.ts'
console.log('registered', Note.className)
