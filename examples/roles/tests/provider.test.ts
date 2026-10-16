import { accessPlugin } from '@ultimabase/access-plugin'
import { UltimaBase } from '@ultimabase/core'
import { postgresPlugin } from '@ultimabase/postgres-plugin'
import { hasRole } from '@ultimabase/roles-plugin'
import { testApplication } from '@ultimabase/testing'
import { expect, it } from 'vitest'

import { Editor } from '../src/schema.ts'

// Another application whose rule uses `hasRole()` but installs no role
// provider: Roles is missing.
const WithoutRoles = UltimaBase.use(accessPlugin(), postgresPlugin())
const Notice = WithoutRoles.Schema.define({
	className: 'Notice',
	fields: (field) => ({ text: field.string({ required: true }) }),
}).with((plugins) => plugins.access({ read: hasRole(Editor) }))

it('fails when no role provider is installed', async () => {
	await using t = await testApplication(new WithoutRoles({ schemas: [Notice] }))

	await expect(t.as(undefined, () => Notice.findMany())).rejects.toMatchObject({
		code: 'PLUGIN_CAPABILITY_MISSING',
	})
})
