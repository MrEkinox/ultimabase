import { UltimaBase } from '@ultimabase/core'
import { graphqlPlugin } from '@ultimabase/graphql-plugin'
import { graphqlYogaPlugin } from '@ultimabase/graphql-yoga-plugin'
import { httpPlugin } from '@ultimabase/http-plugin'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { testApplication } from '@ultimabase/testing'
import { expect, it } from 'vitest'

// GraphQL exposes createOne, updateOne and deleteOne by default: without a
// policy plugin, it starts only when `publicWrites` says everyone may write.
const guestbook = (publicWrites: boolean) => {
	const Guestbook = UltimaBase.use(
		httpPlugin(),
		graphqlPlugin({ publicWrites }),
		graphqlYogaPlugin(),
		postgresPlugin(),
	)
	const Entry = Guestbook.Schema.define({
		className: 'Entry',
		fields: (field) => ({ message: field.string({ required: true }) }),
	})
	return new Guestbook({ schemas: [Entry] })
}

it('refuses to expose writes without a policy', async () => {
	await expect(testApplication(guestbook(false))).rejects.toThrow(
		'GraphQL exposes writes (createEntry, updateEntry, deleteEntry) but no protected policy plugin is installed: install one, such as accessPlugin(), or pass graphqlPlugin({ publicWrites: true }) to let every client write.',
	)
})

it('lets every client write with publicWrites', async () => {
	await using t = await testApplication(guestbook(true))

	const signed = await t.fetch('/graphql', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			query:
				'mutation { createEntry(input: { message: "Hello" }) { message } }',
		}),
	})
	expect(await signed.json()).toStrictEqual({
		data: { createEntry: { message: 'Hello' } },
	})
})
