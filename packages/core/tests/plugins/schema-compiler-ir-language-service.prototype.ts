import {
	type /* hover:option-absence-selector */ SchemaOptionAbsenceSelector,
	type /* hover:option-equality-selector */ SchemaOptionEqualitySelector,
	type /* hover:option-presence-selector */ SchemaOptionPresenceSelector,
	type SchemaSelectorOptions,
} from '../../src/plugin.js'

declare const absenceSelector: SchemaOptionAbsenceSelector
declare const presenceSelector: SchemaOptionPresenceSelector
declare const equalitySelector: SchemaOptionEqualitySelector

const presence: SchemaSelectorOptions = { option: presenceSelector }
const absence: SchemaSelectorOptions = { option: absenceSelector }
const equality: SchemaSelectorOptions = { option: equalitySelector }

void presence
void absence
void equality
