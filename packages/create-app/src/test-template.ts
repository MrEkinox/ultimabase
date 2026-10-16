import { hasHttpListener } from './api-template.js'
import { hasPlugin as has, type InitializerPlan } from './config.js'
import { needsMasterKey } from './security-template.js'

/** Relative import of a generated module from `tests/` (Node runs `.ts`). */
const sourceModule = (plan: InitializerPlan, name: string): string =>
	`../src/${name}.${plan.language}`

/** The Vitest configuration: PostgreSQL started once, one schema per worker. */
export const vitestConfigSource = (plan: InitializerPlan): string =>
	needsMasterKey(plan)
		? `import { ultimabaseTesting } from '@ultimabase/testing/vitest'
import { defineConfig } from 'vitest/config'

const testing = ultimabaseTesting()

// PostgreSQL from TEST_DATABASE_URL, or a container started once (Docker).
export default defineConfig({
  test: {
    ...testing,
    // The application reads its Master key when it is imported.
    env: { ...testing.env, ULTIMABASE_MASTER_KEY: 'test-only-master-key' },
  },
})
`
		: `import { ultimabaseTesting } from '@ultimabase/testing/vitest'
import { defineConfig } from 'vitest/config'

// PostgreSQL from TEST_DATABASE_URL, or a container started once (Docker).
export default defineConfig({ test: { ...ultimabaseTesting() } })
`

/** An empty ACL hides every Task from ordinary reads, the result included. */
const hiddenByAcl = (plan: InitializerPlan): boolean =>
	has(plan, 'acl-permissions-plugin')

const createTask = (
	plan: InitializerPlan,
	title: string,
	binding: 'const task = ' | '' = 'const task = ',
): string =>
	hiddenByAcl(plan)
		? `// An empty ACL hides the Task from ordinary reads: create it as Master.
  ${binding}await t.asMaster(() =>
    Task.createOne({ data: { title: '${title}' } }),
  )`
		: `${binding}await Task.createOne({ data: { title: '${title}' } })`

/** An ACL-hidden Task is not listed, so the test keeps no binding. */
const listedTask = (plan: InitializerPlan, title: string): string =>
	createTask(plan, title, hiddenByAcl(plan) ? '' : 'const task = ')

const restTest = (plan: InitializerPlan): string =>
	`

it('lists Tasks over REST', async () => {
  await using t = await testApplication(ultimabase)
  ${listedTask(plan, 'Listed over REST')}
  const response = await t.fetch('/api/classes/Task')
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({
    results: ${hiddenByAcl(plan) ? '[]' : '[{ id: task.id }]'},
  })
})`

const graphqlTest = (plan: InitializerPlan): string =>
	`

it('lists Tasks over GraphQL', async () => {
  await using t = await testApplication(ultimabase)
  ${listedTask(plan, 'Listed over GraphQL')}
  const response = await t.fetch('/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: '{ findManyTask(first: 10) { nodes { id } } }',
    }),
  })
  expect(await response.json()).toMatchObject({
    data: { findManyTask: { nodes: ${hiddenByAcl(plan) ? '[]' : '[{ id: task.id }]'} } },
  })
})`

/** `tests/task.test`: the production application on an isolated schema. */
export const taskTestSource = (plan: InitializerPlan): string => {
	const http = hasHttpListener(plan) || has(plan, 'http-plugin')
	return `import { testApplication } from '@ultimabase/testing'
import { expect, it } from 'vitest'

import { Task } from '${sourceModule(plan, 'schemas/task')}'
import { ultimabase } from '${sourceModule(plan, 'ultimabase')}'

// testApplication starts the real application on this worker's own schema;
// each call starts from empty tables. Leaving the scope disposes the handle
// and waits for after-commit work${hiddenByAcl(plan) ? '' : '; `_t` is never read'}.
it('creates a Task with its defaults', async () => {
  await using ${hiddenByAcl(plan) ? 't' : '_t'} = await testApplication(ultimabase)
  ${createTask(plan, 'Write the first test')}
  expect(task).toMatchObject({ done: false, title: 'Write the first test' })
})${http && has(plan, 'rest-plugin') ? restTest(plan) : ''}${
		http && !has(plan, 'rest-plugin') && has(plan, 'graphql-yoga-plugin')
			? graphqlTest(plan)
			: ''
	}
`
}
