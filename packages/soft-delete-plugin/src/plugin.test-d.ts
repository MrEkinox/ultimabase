import { expectTypeOf, test } from 'vitest'

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
