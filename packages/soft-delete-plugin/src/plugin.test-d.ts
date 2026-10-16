import { expectTypeOf, test } from 'vitest'
import { UltimaBase } from '@ultimabase/core'
import { accessPlugin } from '@ultimabase/access-plugin'

import { softDeletePlugin, type SoftDeleteOptions } from './index.js'

const App = UltimaBase.use(softDeletePlugin())

test('types only the accepted feature options', () => {
	expectTypeOf<SoftDeleteOptions>().toEqualTypeOf<{
		readonly mode?: 'command'
	}>()

	App.Schema.define({
		className: 'TypedSoftDeleteModes',
		fields: (field) => ({ title: field.string() }),
		softDelete: { mode: 'command' },
	})
	App.Schema.define({
		className: 'TypedSoftDeleteBadMode',
		fields: (field) => ({ title: field.string() }),
		// @ts-expect-error -- Only `mode: 'command'` exists.
		softDelete: { mode: 'replace-delete' },
	})
	// @ts-expect-error -- The plugin factory takes no options (review decisions 1-2).
	softDeletePlugin({ defaultMode: 'disabled' })
})

test('projects fields and the same commands in both modes', () => {
	const Logical = App.Schema.define({
		className: 'SourceSoftDeleteDocument',
		fields: (field) => ({ title: field.string({ required: true }) }),
		softDelete: true,
	})
	const Command = App.Schema.define({
		className: 'SourceSoftDeleteCommandDocument',
		fields: (field) => ({ title: field.string({ required: true }) }),
		softDelete: { mode: 'command' },
	})

	void Command.softDeleteOne({ id: 'document-1', select: { isDeleted: true } })
	void Command.softDeleteMany({ where: { title: { eq: 'old' } } })
	void Command.restoreOne({ id: 'document-1', select: { deletedAt: true } })
	void Command.restoreMany({ where: {} })
	void Command.purgeOne({ id: 'document-1' })
	void Command.purgeMany({ where: {} })
	expectTypeOf(
		Logical.softDeleteMany({ where: {}, select: { deletedAt: true } }),
	).resolves.toEqualTypeOf<
		readonly { readonly id: string; readonly deletedAt: string | null }[]
	>()
	expectTypeOf(
		Logical.restoreOne({ id: 'document-1', select: { isDeleted: true } }),
	).resolves.toEqualTypeOf<{
		readonly id: string
		readonly isDeleted: boolean
	}>()

	// @ts-expect-error -- A many-row command targets a `where`, not an `id`.
	void Logical.restoreMany({ id: 'document-1' })
	// @ts-expect-error -- Server-written fields are rejected in create input.
	void Logical.createOne({ data: { title: 'x', isDeleted: true } })
	// @ts-expect-error -- `deletedAt` is server-written too.
	void Logical.updateOne({ where: { id: 'x' }, data: { deletedAt: null } })
})

test('adds nothing to schemas that do not set softDelete', () => {
	const Plain = App.Schema.define({
		className: 'SourcePlainDocument',
		fields: (field) => ({ title: field.string() }),
	})
	type PlainCommands = Extract<
		keyof typeof Plain,
		'purgeOne' | 'restoreOne' | 'softDeleteOne'
	>
	expectTypeOf<PlainCommands>().toEqualTypeOf<never>()
	// @ts-expect-error -- No `isDeleted` without `softDelete`.
	void Plain.findMany({ where: { isDeleted: { eq: false } } })
})

test('lets Access rule the request commands by name', () => {
	const Guarded = UltimaBase.use(softDeletePlugin(), accessPlugin())
	Guarded.Schema.define({
		className: 'SourceGuardedDocument',
		fields: (field) => ({ title: field.string() }),
		softDelete: true,
	}).with({
		access: {
			read: true,
			softDeleteOne: true,
			softDeleteMany: true,
			restoreOne: false,
			restoreMany: false,
		},
	})
	Guarded.Schema.define({
		className: 'SourceGuardedPurgeDocument',
		fields: (field) => ({ title: field.string() }),
		softDelete: true,
	}).with({
		// @ts-expect-error -- Purge is Master-only, so Access has no rule for it.
		access: { purgeOne: true },
	})
})
