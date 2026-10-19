import { App } from './app.ts';
// Discoverability probe only (not registered): empty rules object and declaration.
export const Note = App.Schema.define({ className: 'Note', fields: (field) => ({ body: field.string() }) }).with({});
