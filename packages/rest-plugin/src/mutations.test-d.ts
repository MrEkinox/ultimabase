import { UltimaBase, type ApplicationRequestExecutor } from '@ultimabase/core'
import { expectTypeOf, test } from 'vitest'

import {
	executeRestMutationRequest,
	normalizeRestMutationRequest,
	type RestMutationCommand,
} from './index.js'
import type { RequestContext } from '@ultimabase/core/plugin'

const Article = UltimaBase.Schema.define({
	className: 'RestMutationTypeArticle',
	fields: (field) => ({
		slug: field.string({ indexed: 'unique' }),
		title: field.string({ required: true }),
	}),
})

declare const context: RequestContext
declare const executor: ApplicationRequestExecutor
declare const request: Request

test('correlates REST mutation discriminants with Core schema commands', async () => {
	const create = await normalizeRestMutationRequest(Article, {
		operation: 'create',
		request,
	})
	expectTypeOf(create).toEqualTypeOf<
		RestMutationCommand<typeof Article, 'create'>
	>()
	expectTypeOf(create.kind).toEqualTypeOf<'create-one'>()

	const update = await normalizeRestMutationRequest(Article, {
		id: '01991f00-0000-7000-8000-000000000001',
		operation: 'update',
		request,
	})
	expectTypeOf(update.kind).toEqualTypeOf<'update-one'>()

	const bulk = executeRestMutationRequest(executor, context, Article, {
		operation: 'bulk-create',
		request,
	})
	expectTypeOf(bulk).toEqualTypeOf<Promise<readonly object[]>>()

	// @ts-expect-error -- item update routes require the captured object identifier.
	void normalizeRestMutationRequest(Article, { operation: 'update', request })
})
