// Lists with take and skip, at the root and on a relation.
import { testApplication } from '@ultimabase/testing'
import { it } from 'vitest'
import { requestFiles } from '../../../scripts/requests.ts'
import { listApp } from './list.ts'

const { send, check } = requestFiles(
	new URL('requests/', import.meta.url),
	testApplication(listApp),
)

it('reads take and skip instead of connections', async () => {
	await send(`mutation {
		createPerson(data: { name: "Ada", posts: { create: [
			{ title: "Notes", slug: "notes" }, { title: "Plans", slug: "plans" }
		] } }) { id }
	}`)
	await check('list')
})
