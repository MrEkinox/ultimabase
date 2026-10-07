import { expectTypeOf, test } from 'vitest'

import { UltimaBase } from '@ultimabase/core'

import { hooksPlugin } from '../src/plugin.js'

const HookApplication = UltimaBase.use(hooksPlugin())

test('infers field Hooks directly from the configured source', () => {
	const Post = HookApplication.Schema.define({
		className: 'SourceHookPost',
		fields: (field) => ({
			count: field.int({
				hooks: {
					resolveInput: ({ value }) => {
						expectTypeOf(value).toEqualTypeOf<number>()
						return value + 1
					},
				},
				required: true,
			}),
			title: field.string({
				required: true,
				hooks: {
					resolveInput: ({ value }) => {
						expectTypeOf(value).toEqualTypeOf<string>()
						return value.trim()
					},
				},
			}),
		}),
	})

	expectTypeOf(Post.className).toEqualTypeOf<'SourceHookPost'>()
})

test('keeps Hooks absent from an unconfigured source factory', () => {
	UltimaBase.Schema.define({
		className: 'SourceWithoutHooks',
		fields: (field) => ({
			// @ts-expect-error -- Hooks is installed only on its configured factory.
			title: field.string({ hooks: {} }),
		}),
	})
})
