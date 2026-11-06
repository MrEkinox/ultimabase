// Uses the catalog over GraphQL, as a client would, each test on a new
// in-memory database. The request files are shown on the page (D-282).
import { testApplication } from '@ultimabase/testing'
import { it } from 'vitest'
import { requestFiles } from '../../../scripts/requests.ts'
import { app } from './app.ts'

const { check } = requestFiles(
	new URL('requests/', import.meta.url),
	testApplication(app),
)

it('creates and reads a product over GraphQL', async () => {
	await check('create-product')
})

it('leaves a private field out of the schema', async () => {
	// A field only Master reads is not in the schema.
	await check('hidden-cost')
})

it('gives a JSON field and a list one type for a shared enum', async () => {
	await check('create-opening')
})
