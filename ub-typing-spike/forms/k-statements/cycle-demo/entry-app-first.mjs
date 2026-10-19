// Entry imports the application module first: note.ts (definition + statements) runs first.
import { noteApp } from './note-app.ts'
console.log('registered:', noteApp.registration.map((entry) => `${entry.className} rules=${Object.keys(entry.rules).join(',')}`).join('; '))
