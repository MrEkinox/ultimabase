import { expectTypeOf, test } from 'vitest'
import { UltimaBase } from '@ultimabase/core'

import {
	softDeletePlugin,
	type SoftDeleteMode,
	type SoftDeletePluginOptions,
	type SoftDeleteSchemaOption,
} from './index.js'

test('types only the accepted plugin and schema modes', () => {
	expectTypeOf<SoftDeleteMode>().toEqualTypeOf<
		'disabled' | 'explicit' | 'replace-delete'
	>()
	expectTypeOf<SoftDeleteSchemaOption>().toEqualTypeOf<
		false | 'explicit' | 'replace-delete'
	>()

	softDeletePlugin()
	softDeletePlugin({ defaultMode: 'disabled' })
	softDeletePlugin({ defaultMode: 'replace-delete', instanceId: 'archive' })

	// @ts-expect-error -- Plugin options deliberately have no schema allowlist.
	softDeletePlugin({ schemas: ['Post'] })
	// @ts-expect-error -- Plugin defaults use the closed mode vocabulary.
	softDeletePlugin({ defaultMode: 'delete' })

	const options = {
		defaultMode: 'explicit',
		instanceId: 'editorial',
	} as const satisfies SoftDeletePluginOptions
	expectTypeOf(options.defaultMode).toEqualTypeOf<'explicit'>()
})

test('projects explicit schema fields and mutations without Typegen', () => {
	const Application = UltimaBase.use(softDeletePlugin())
	const Explicit = Application.Schema.define({
		className: 'SourceSoftDeleteDocument',
		fields: (field) => ({ title: field.string({ required: true }) }),
		softDelete: 'explicit',
	})
	const ReplaceDelete = Application.Schema.define({
		className: 'SourceReplaceDeleteDocument',
		fields: (field) => ({ title: field.string({ required: true }) }),
		softDelete: 'replace-delete',
	})

	void Explicit.softDelete({ id: 'document-1', select: { isDeleted: true } })
	void Explicit.restore({ id: 'document-1', select: { isDeleted: true } })
	void Explicit.purge({ id: 'document-1' })
	void ReplaceDelete.restore({ id: 'document-1', select: { isDeleted: true } })
	void ReplaceDelete.purge({ id: 'document-1' })
	type HasReplaceDeleteSoftDelete =
		'softDelete' extends keyof typeof ReplaceDelete ? true : false
	expectTypeOf<HasReplaceDeleteSoftDelete>().toEqualTypeOf<false>()
})

test('projects only the commands inherited from one literal default mode', () => {
	const ExplicitApp = UltimaBase.use(
		softDeletePlugin({ defaultMode: 'explicit' }),
	)
	const Inherited = ExplicitApp.Schema.define({
		className: 'SourceInheritedSoftDeleteDocument',
		fields: (field) => ({ title: field.string() }),
	})
	const Excluded = ExplicitApp.Schema.define({
		className: 'SourceExcludedSoftDeleteDocument',
		fields: (field) => ({ title: field.string() }),
		softDelete: false,
	})
	void Inherited.softDelete({ id: 'document-1', select: { isDeleted: true } })
	void Inherited.restore({ id: 'document-1', select: { isDeleted: true } })
	void Inherited.purge({ id: 'document-1' })
	type ExcludedSoftDelete = 'softDelete' extends keyof typeof Excluded
		? true
		: false
	type ExcludedRestore = 'restore' extends keyof typeof Excluded ? true : false
	expectTypeOf<ExcludedSoftDelete>().toEqualTypeOf<false>()
	expectTypeOf<ExcludedRestore>().toEqualTypeOf<false>()
	void Excluded

	const ReplaceApp = UltimaBase.use(
		softDeletePlugin({ defaultMode: 'replace-delete' }),
	)
	const Replaced = ReplaceApp.Schema.define({
		className: 'SourceInheritedReplaceDeleteDocument',
		fields: (field) => ({ title: field.string() }),
	})
	void Replaced.restore({ id: 'document-1', select: { isDeleted: true } })
	type ReplaceSoftDelete = 'softDelete' extends keyof typeof Replaced
		? true
		: false
	expectTypeOf<ReplaceSoftDelete>().toEqualTypeOf<false>()

	const DisabledApp = UltimaBase.use(softDeletePlugin())
	const Disabled = DisabledApp.Schema.define({
		className: 'SourceInheritedDisabledDocument',
		fields: (field) => ({ title: field.string() }),
	})
	type DisabledRestore = 'restore' extends keyof typeof Disabled ? true : false
	expectTypeOf<DisabledRestore>().toEqualTypeOf<false>()
	void Disabled
})
