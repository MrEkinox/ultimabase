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
