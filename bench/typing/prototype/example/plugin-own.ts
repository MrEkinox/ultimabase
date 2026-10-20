// A plugin's own code sees a model through the fields it adds (D-57): it
// reads and writes them, and nothing else. `tsc` fails if one does not hold.
import type { Field } from '../fields.ts'
import type { Queries } from '../query.ts'
import type { PluginOf, PluginTypes, UseOf } from '../ultimabase.ts'
import { defineApp, defineModel, memory } from '../index.ts'
import { definePlugin } from '../ultimabase.ts'

interface TrashCommands<F> {
	readonly trash: Queries<F>
}
interface Trash extends PluginTypes {
	readonly name: 'trash'
	readonly adds: {
		readonly trashedAt: Field<Date, { readonly optional: true }>
	}
	readonly commands: TrashCommands<this['fields']>
}
const trashDefinition = definePlugin<Trash>({
	name: 'trash',
	manifest: { name: 'trash', version: '1.0.0' },
	redirect: {
		delete: ({ where, queries }) =>
			queries.update({ where, data: { trashedAt: new Date() } }),
	},
	hooks: {
		beforeFind: ({ where }) => {
			const filter: Date | null | undefined =
				where.trashedAt instanceof Date ? where.trashedAt : undefined
			void filter
		},
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
