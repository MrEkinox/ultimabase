import * as pluginKit from '../src/index.js'
import { describe, expect, it } from 'vitest'

describe('@ultimabase/plugin-kit public API', () => {
	it('exports only focused authoring helpers', () => {
		expect(Object.keys(pluginKit).sort()).toStrictEqual([
			'SchemaPatchBuilder',
			'createPluginEventDispatcher',
			'defineOutputDescriptor',
			'definePluginEvent',
			'definePluginEventCapability',
			'definePluginFieldBuilderMethod',
			'definePluginFieldOption',
			'definePluginModule',
			'definePluginOptionsParser',
			'defineTypegenModule',
			'observePluginEvent',
			'optionalPluginEvents',
			'patchSchemas',
			'providePluginEvent',
			'providePluginOperation',
			'schemaPatch',
		])
	})
})
