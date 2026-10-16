import { UltimaBase } from '@ultimabase/core'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { testApplication } from '@ultimabase/testing'
import { expect, it } from 'vitest'

import { ratingPlugin } from '../src/rating-plugin.ts'

// A separate application: one per file, and only this one installs ratings.
const App = UltimaBase.use(ratingPlugin(), postgresPlugin())

//#region review
const Review = App.Schema.define({
	className: 'Review',
	fields: (f) => ({
		body: f.string({ required: true, searchable: true }),
		stars: f.int({ required: true }),
		score: f.virtual({
			output: (output) => output.rating(),
			select: { stars: true },
			resolve: ({ item }) =>
				typeof item.stars === 'number' ? item.stars * 20 : 0,
		}),
	}),
})
//#endregion review

const reviews = new App({ schemas: [Review] })

it('offers the plugin builder method and field option', async () => {
	await using _t = await testApplication(reviews)
	const review = await Review.createOne({
		data: { body: 'Clear and short', stars: 4 },
		select: { score: true },
	})
	expect(review).toStrictEqual({ id: review.id, score: 80 })
})
