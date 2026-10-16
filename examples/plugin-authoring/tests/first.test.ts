//#region first-test
import { testApplication } from '@ultimabase/testing'
import { expect, it } from 'vitest'

import { Post } from '../src/schema.ts'
import { ultimabase } from '../src/ultimabase.ts'

it('creates a Post', async () => {
	await using t = await testApplication(ultimabase)
	const post = await Post.createOne({ data: { title: 'Ship' } })
	expect(post.archivedAt).toBeNull()
})
//#endregion first-test
