import { App } from './app.ts';
// Discoverability probe only (not registered): empty spot in the declaration.
export const Note = App.Schema.define({ className: 'Note', fields: (field) => ({ body: field.string() }), });
