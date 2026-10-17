import { testApplication, type TestApplication } from '@ultimabase/testing'
import { expect, it } from 'vitest'

import { ultimabase } from '../src/ultimabase.ts'
import { formatWorkflow } from '../src/workflow/operations.ts'

const graphql = (t: TestApplication, query: string) =>
	t.fetch('/graphql', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ query }),
	})

it('executes the operation from TypeScript', async () => {
	await testApplication(ultimabase)

	//#region execute-operation
	const result = await ultimabase.operation(formatWorkflow).execute('  ready  ')
	//#endregion execute-operation

	expect(result).toBe('ready')
})

it('binds the operation to a typed GraphQL query field', async () => {
	await using t = await testApplication(ultimabase)
	const sdl = ultimabase.plugin('@ultimabase/graphql-plugin').printSchema()
	expect(sdl).toContain('formatWorkflow(input: String!): String!')

	const response = await graphql(t, '{ formatWorkflow(input: "  ready  ") }')
	expect(await response.json()).toStrictEqual({
		data: { formatWorkflow: 'ready' },
	})
})

it('exposes the public operation over REST too', async () => {
	await using t = await testApplication(ultimabase)
	const response = await t.fetch('/api/operations/formatWorkflow', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ input: '  ready  ' }),
	})
	expect(response.status).toBe(200)
	expect(await response.json()).toStrictEqual({ result: 'ready' })
})

it('adds an independent GraphQL schema contribution', async () => {
	await using t = await testApplication(ultimabase)
	const response = await graphql(t, '{ workflowHealth }')
	expect(await response.json()).toStrictEqual({
		data: { workflowHealth: 'ok' },
	})
})

it('serves a plugin route through the HTTP plugin', async () => {
	await using t = await testApplication(ultimabase)
	const response = await t.fetch('/status')
	expect(response.status).toBe(200)
	expect(await response.json()).toStrictEqual({ ready: true })
})
