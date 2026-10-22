// A plugin's own code sees a model through the fields it adds (D-57): it
// reads and writes them, and nothing else. `tsc` fails if one does not hold.
import type { Field, PluginOf, PluginTypes, Queries, UseOf } from '../index.ts'
import { defineApp, defineModel, definePlugin, memory } from '../index.ts'

interface TrashCommands<F> {
	readonly trash: Queries<F>
}
interface Trash extends PluginTypes {
	readonly name: 'trash'
	readonly addedFields: {
		readonly trashedAt: Field<Date, { readonly optional: true }>
	}
	readonly commands: TrashCommands<this['fields']>
}
const trashDefinition = definePlugin<Trash>({
	name: 'trash',
	manifest: { name: 'trash', version: '1.0.0' },
	addedFields: (f) => ({ trashedAt: f.date({ optional: true }) }),
	redirect: {
		delete: ({ where, queries }) =>
			queries.update({ where, data: { trashedAt: new Date() } }),
	},
	hooks: {
		// Trashed rows do not exist, except through `trash` (D-17, D-71).
		beforeFind: ({ where, command }) =>
			command === 'trash'
				? where({ trashedAt: { not: null } })
				: where({ trashedAt: null }),
		afterDelete: async ({ record, queries }) => {
			const at: Date | null = record.trashedAt
			void at
			void (await queries.findMany({ where: { trashedAt: null } }))
			// @ts-expect-error: `title` belongs to the model, not to the plugin.
			void (await queries.findMany({ where: { title: 'x' } }))
			void (await queries.update({
				where: { id: record.id },
				// @ts-expect-error: `trashedAt` is a date.
				data: { trashedAt: 'now' },
			}))
			// @ts-expect-error: the plugin cannot read a model's field.
			void record.title
		},
	},
	commands: ({ queries }) => ({ trash: queries }),
})
definePlugin<Trash>({
	name: 'trash',
	manifest: { name: 'trash', version: '1.0.0' },
	addedFields: (f) => ({ trashedAt: f.date({ optional: true }) }),
	hooks: {
		beforeFind: ({ where, command }) =>
			// @ts-expect-error: `trahs` is not a command of the plugin.
			command === 'trahs' ? where({ trashedAt: null }) : undefined,
	},
	commands: ({ queries }) => ({ trash: queries }),
})
definePlugin<Trash>({
	name: 'trash',
	manifest: { name: 'trash', version: '1.0.0' },
	addedFields: (f) => ({ trashedAt: f.date({ optional: true }) }),
	hooks: {
		// @ts-expect-error: a filter only comes from `where`.
		beforeFind: () => ({ trashedAt: null }),
	},
	commands: ({ queries }) => ({ trash: queries }),
})
export const trash: UseOf<Trash> = trashDefinition.use
export const trashPlugin: PluginOf<Trash> = trashDefinition.plugin

// The application still sees the commands with the model's own fields.
export const Note = defineModel({
	name: 'Note',
	use: [trash()],
	fields: (f) => ({ title: f.string() }),
})
void Note.trash.findMany({ where: { title: 'x', trashedAt: null } })
void Note.findMany({ where: { trashedAt: null } })
defineApp({ database: memory(), plugins: [trashPlugin()], models: [Note] })
