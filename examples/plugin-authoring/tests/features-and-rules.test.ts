import { UltimaBase } from '@ultimabase/core'
import { readSchemaRules } from '@ultimabase/core/plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { testApplication } from '@ultimabase/testing'
import { waitForAfterCommit } from '@ultimabase/testing/plugins'
import { expect, it, vi } from 'vitest'

import { reviewPlugin } from '../src/review-plugin.ts'

// A separate application: one per file, and only this one installs reviews.
const App = UltimaBase.use(reviewPlugin(), postgresPlugin())

//#region reviewed-story
const Story = App.Schema.define({
	className: 'Story',
	fields: (f) => ({ title: f.string({ required: true }) }),
	reviewable: true,
	// `indexes` may name a field the feature adds.
	indexes: [{ fields: ['reviewedAt', 'title'] }],
}).with((plugins) => plugins.review('editors'))
//#endregion reviewed-story

const stories = new App({ logger: false, schemas: [Story] })

it('adds the feature fields and commands, and reads the rule after commit', async () => {
	await using t = await testApplication(stories)
	const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)

	//#region approve-story
	const story = await Story.createOne({ data: { title: 'Launch' } })
	await waitForAfterCommit()
	expect(info).toHaveBeenCalledWith('[review] Story waits for editors')
	const approved = await Story.approveOne({ id: story.id })
	//#endregion approve-story

	expect(story.reviewedAt).toBeNull()
	expect(approved.reviewedAt).toEqual(expect.any(String))
	info.mockRestore()
	await t.afterCommit()
})

it('sets the feature in define and its rule in .with', () => {
	const compiled = stories.compile()
	const schema = compiled.schemas.get('Story')
	if (schema === undefined) throw new TypeError('Missing schema Story')
	expect(schema.persistedFields.reviewedAt).toMatchObject({ kind: 'dateTime' })
	expect(
		readSchemaRules(schema, { pluginId: '@example/review-plugin' }),
	).toEqual({ reviewable: {}, review: 'editors' })
	const surface = compiled.schemaSurfaces.find(
		({ schema }) => schema.className === 'Story',
	)
	expect([...(surface?.schemaMutations ?? [])].map(([name]) => name)).toEqual([
		'approveOne',
	])
})

it('reports a feature set without the rule it requires', () => {
	const Draft = App.Schema.define({
		className: 'Draft',
		fields: (f) => ({ title: f.string() }),
		reviewable: true,
	})
	//#region missing-rule
	// `reviewable: true` without `plugins.review(...)`: a TypeScript error on
	// the callback, and a TypeError when `.with` runs.
	expect(() =>
		// @ts-expect-error -- the feature requires the `review` rule.
		Draft.with((plugins) => plugins),
	).toThrow(
		'Draft sets reviewable in define(), which requires .with((plugins) => plugins.review({ … }))',
	)
	//#endregion missing-rule
	// Without `.with`, the application refuses the schema when it compiles.
	expect(() =>
		new App({ logger: false, schemas: [Draft] as never }).compile(),
	).toThrow('Draft sets reviewable in define()')
})

it('rejects a rule in define and a feature in .with', () => {
	expect(() =>
		App.Schema.define({
			className: 'Note',
			fields: (f) => ({ body: f.string() }),
			// @ts-expect-error -- a rule is a method of `plugins` in `.with`.
			review: 'editors',
		}),
	).toThrow('Unknown schema option: review')
	const Note = App.Schema.define({
		className: 'Note',
		fields: (f) => ({ body: f.string() }),
	})
	expect(() =>
		Note.with((plugins) => {
			// @ts-expect-error -- a feature is a key of `define`, not a rule.
			void plugins.reviewable
			return plugins
		}),
	).not.toThrow()
})
