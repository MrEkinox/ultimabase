import { expectTypeOf, test } from 'vitest'

import type { PluginExports } from '@ultimabase/core'
import type { workflowConsumerPlugin } from './fixtures/plugins/capabilities.js'
import {
	formatCapability,
	queueCapability,
} from './fixtures/plugins/capabilities.js'
import { workflowPlugin } from './fixtures/plugins/authoring.js'

test('preserves plugin instance and setup export types', () => {
	const editorial = workflowPlugin('editorial')

	expectTypeOf(editorial.manifest.identity.instanceId).toEqualTypeOf<
		string | undefined
	>()
	expectTypeOf<PluginExports<typeof editorial>['ready']>().toEqualTypeOf<true>()
	expectTypeOf<
		PluginExports<typeof workflowConsumerPlugin>['format']
	>().toEqualTypeOf<'compact'>()
})

test('keeps capability lifetime visible in the token type', () => {
	expectTypeOf(formatCapability.lifetime).toEqualTypeOf<'declaration'>()
	expectTypeOf(queueCapability.lifetime).toEqualTypeOf<'application'>()
})
