import { graphqlOperationProtocol } from '@ultimabase/graphql-plugin'
import { testApplication } from '@ultimabase/testing'
import { expect, it } from 'vitest'

import { Post } from '../src/schema.ts'
import { ultimabase } from '../src/ultimabase.ts'
import { formatWorkflow } from '../src/workflow/operations.ts'

// These regions are shown in the Core README.
it('resolves one cached handle per schema of the application', async () => {
	await using t = await testApplication(ultimabase)

	//#region schema-handles
	const Posts = ultimabase.schema(Post)
	const Comments = ultimabase.schema('Comment')

	const samePost = Posts.schema === Post
	const commentClass = Comments.schema.className
	const comments = await Comments.schema.findMany()
	//#endregion schema-handles

	expect(samePost).toBe(true)
	expect(ultimabase.schema(Post)).toBe(Posts)
	expect(commentClass).toBe('Comment')
	expect(comments).toStrictEqual([])
	await t.afterCommit()
})

it('selects the operations one transport may execute', async () => {
	await using t = await testApplication(ultimabase)

	//#region expose-operations
	const exposed = ultimabase.exposeOperations({
		operations: [formatWorkflow],
		transport: graphqlOperationProtocol,
	})
	//#endregion expose-operations

	expect(
		exposed.operations.map(({ bound, name, public: declared }) => ({
			bound,
			name,
			publicName: declared?.name,
		})),
	).toStrictEqual([
		{
			bound: true,
			name: 'community.workflow.format',
			publicName: 'formatWorkflow',
		},
	])
	await t.afterCommit()
})
