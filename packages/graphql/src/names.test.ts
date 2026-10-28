// The names of the generated root fields (D-107).
import { describe, expect, it } from 'vitest'
import { rootNames } from './names.ts'

describe('rootNames', () => {
	it('names the one-row field after the model and the list after its plural', () => {
		expect(rootNames('BlogPost', undefined)).toStrictEqual({
			single: 'blogPost',
			list: 'blogPosts',
		})
		expect(rootNames('Person', 'people')).toStrictEqual({
			single: 'person',
			list: 'people',
		})
	})

	it('refuses a list named like its one-row field', () => {
		expect(() => rootNames('Sheep', 'sheep')).toThrow(
			'Sheep: its list field would be named sheep too; set .with({ graphql: { plural } }).',
		)
	})
})
