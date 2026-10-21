// `definePlugin` checks the code against the plugin's types (D-57). `tsc`
// fails if one does not hold.
import type { Queries } from '../query.ts'
import type { PluginTypes } from '../ultimabase.ts'
import { definePlugin } from '../ultimabase.ts'

interface ArchiveCommands<F> {
	readonly archived: Queries<F>
}
interface Archive extends PluginTypes {
	readonly name: 'archive'
	readonly commands: ArchiveCommands<this['fields']>
}
declare function archivedOnly<F>(model: Queries<F>): Queries<F>
// Written by hand, the manifest holds only what the kernel reads.
const manifest = { name: 'ultimabase-archive', version: '1.0.0' }

export const ok = definePlugin<Archive>({
	name: 'archive',
	manifest,
	commands: (model) => ({ archived: archivedOnly(model.queries) }),
})
definePlugin<Archive>({
	// @ts-expect-error: the name differs from the interface's.
	name: 'archives',
	manifest,
	commands: (model) => ({ archived: archivedOnly(model.queries) }),
})
// @ts-expect-error: the interface declares commands.
definePlugin<Archive>({ name: 'archive', manifest })
// @ts-expect-error: a command is missing.
definePlugin<Archive>({ name: 'archive', manifest, commands: () => ({}) })
// @ts-expect-error: the manifest is required.
definePlugin<Archive>({
	name: 'archive',
	commands: (model) => ({ archived: archivedOnly(model.queries) }),
})
definePlugin<Archive>({
	name: 'archive',
	// @ts-expect-error: a manifest has a version.
	manifest: { name: 'ultimabase-archive' },
	commands: (model) => ({ archived: archivedOnly(model.queries) }),
})
interface Tag extends PluginTypes {
	readonly name: 'tag'
	readonly with: { readonly color?: string }
}
// @ts-expect-error: the interface declares no commands.
definePlugin<Tag>({ name: 'tag', manifest, commands: () => ({}) })
