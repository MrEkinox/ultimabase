import { expectTypeOf, test } from 'vitest'

import type { GeneratedPointerHandle, PointerValue } from '@ultimabase/core'
import type {
	DocsAddress,
	DocsArticleCreateInput,
	DocsPostCreateInput,
	DocsPostItem,
	DocsProductCreateInput,
	DocsProductItem,
	DocsProductOutput,
} from './fixtures/data-modeling/.ultimabase/schema.generated.js'

test('protects generated stored, virtual, and input field shapes', () => {
	expectTypeOf<DocsArticleCreateInput>().toEqualTypeOf<{
		readonly published?: boolean | null
		readonly slug: string
		readonly title: string
	}>()
	expectTypeOf<DocsProductCreateInput['status']>().toEqualTypeOf<
		'draft' | 'published' | null | undefined
	>()
	expectTypeOf<DocsProductItem['tags']>().toEqualTypeOf<
		readonly string[] | null
	>()
	expectTypeOf<
		Extract<'displayPrice', keyof DocsProductItem>
	>().toEqualTypeOf<never>()
	expectTypeOf<DocsProductOutput['displayPrice']>().toEqualTypeOf<string>()
})

test('protects embedded object and relationship identities', () => {
	expectTypeOf<DocsAddress>().toEqualTypeOf<{
		readonly city: string
		readonly countryCode: string
		readonly line1: string
		readonly line2: string | null
	}>()
	expectTypeOf<DocsPostItem['author']>().toEqualTypeOf<
		GeneratedPointerHandle<'DocsAuthor'>
	>()
	expectTypeOf<DocsPostCreateInput['author']>().toEqualTypeOf<PointerValue>()
	expectTypeOf<
		Extract<'reviewers', keyof DocsPostItem>
	>().toEqualTypeOf<never>()
})

test('rejects invalid create inputs and model mutation', () => {
	const validArticle: DocsArticleCreateInput = {
		slug: 'typed-backends',
		title: 'Typed backends',
	}
	expectTypeOf(validArticle.title).toEqualTypeOf<string>()

	// @ts-expect-error -- Required fields cannot be omitted from create input.
	const missingTitle: DocsArticleCreateInput = { slug: 'missing-title' }
	expectTypeOf(missingTitle).toEqualTypeOf<DocsArticleCreateInput>()

	const product = {} as DocsProductItem
	// @ts-expect-error -- Persisted model values are immutable snapshots.
	product.price = '21.00'
})
