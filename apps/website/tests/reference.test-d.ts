import { expectTypeOf, test } from 'vitest'

import {
	FrameworkError,
	QueryBuilder,
	Schema,
	definePlugin,
} from '@ultimabase/core'
import type { GraphqlPluginOptions } from '@ultimabase/graphql-plugin'
import type { PasswordAuthPluginOptions } from '@ultimabase/password-auth-plugin'
import type { RestPluginOptions } from '@ultimabase/rest-plugin'
import type { SoftDeletePluginOptions } from '@ultimabase/soft-delete-plugin'

const ReferencePost = Schema.define({
	className: 'ReferencePost',
	fields: (field) => ({ title: field.string() }),
})
const query = new QueryBuilder(ReferencePost).select({ id: true })
const error = new FrameworkError('NOT_FOUND', 'Missing')
const plugin = definePlugin({
	core: '^0.0.0',
	pluginId: 'reference.example',
	version: '1.0.0',
})

test('keeps representative reference signatures on public package exports', () => {
	expectTypeOf(ReferencePost.className).toEqualTypeOf<'ReferencePost'>()
	expectTypeOf(query.schema).toEqualTypeOf<typeof ReferencePost>()
	expectTypeOf(error.code).toEqualTypeOf<'NOT_FOUND'>()
	expectTypeOf(
		plugin.manifest.identity.pluginId,
	).toEqualTypeOf<'reference.example'>()
	expectTypeOf<RestPluginOptions['basePath']>().toEqualTypeOf<
		string | undefined
	>()
	expectTypeOf<GraphqlPluginOptions['limits']>().not.toBeAny()
	expectTypeOf<PasswordAuthPluginOptions['session']>().not.toBeAny()
	expectTypeOf<SoftDeletePluginOptions['defaultMode']>().toEqualTypeOf<
		'disabled' | 'explicit' | 'replace-delete' | undefined
	>()
})
