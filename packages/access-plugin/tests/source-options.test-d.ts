import { expectTypeOf, test } from 'vitest'

import { UltimaBase } from '@ultimabase/core'

import { accessPlugin } from '../src/plugin.js'
const AccessApplication = UltimaBase.use(
	accessPlugin({ allowWithoutRule: { all: true } }),
)

test('infers field Access directly from the configured source', () => {
	const Post = AccessApplication.Schema.define({
		className: 'SourceAccessPost',
		fields: (field) => ({
			count: field.int({
				access: {
					read: {
						orderBy: true,
						output: ({ value }) => {
							expectTypeOf(value).toEqualTypeOf<number>()
							return value > 0
						},
						where: true,
					},
				},
				required: true,
			}),
			draft: field.string({
				access: {
					read: {
						output: ({ value }) => {
							expectTypeOf(value).toEqualTypeOf<string | null>()
							return value !== null
						},
						orderBy: true,
						where: true,
					},
					write: {
						clear: ({ originalValue }) => {
							expectTypeOf(originalValue).toEqualTypeOf<string | null>()
							return true
						},
						fill: ({ value }) => value.length > 0,
						replace: ({ originalValue, value }) => originalValue !== value,
					},
				},
			}),
			related: field.relation({
				access: {
					read: () => true,
					write: ({ change }) => {
						expectTypeOf(change.action).toEqualTypeOf<
							'clear' | 'connect' | 'create' | 'disconnect' | 'set' | 'update'
						>()
						return true
					},
				},
				target: 'SourceAccessPost',
			}),
			title: field.string({ required: true }),
		}),
	})

	expectTypeOf(Post.className).toEqualTypeOf<'SourceAccessPost'>()
})

test('keeps Access absent from an unconfigured source factory', () => {
	UltimaBase.Schema.define({
		className: 'SourceWithoutAccess',
		fields: (field) => ({
			// @ts-expect-error -- Access is installed only on its configured factory.
			title: field.string({ access: false }),
		}),
	})
})
