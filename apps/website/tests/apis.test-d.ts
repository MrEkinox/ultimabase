import { expectTypeOf, test } from 'vitest'

import type { HttpApplication } from '@ultimabase/http-plugin'

import type { createApiFixture } from './fixtures/apis/application.js'
import type { readPublishedPosts } from './fixtures/apis/typescript.js'

test('preserves API fixture and generated model types', () => {
	expectTypeOf<
		Awaited<ReturnType<typeof createApiFixture>>['http']
	>().toEqualTypeOf<HttpApplication>()
	expectTypeOf<
		Awaited<ReturnType<typeof readPublishedPosts>>[number]['title']
	>().toEqualTypeOf<string>()
})
