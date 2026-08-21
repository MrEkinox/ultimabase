import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { createLanguageService } from '../../tooling/vitest/typescript-language-service.js'

const fileName = path.join(
	import.meta.dirname,
	'plugin-kit-authoring.packed.fixture.ts',
)
const source = `
import { type PluginExports } from '@ultimabase/core'
import { z } from 'zod'
import {
  definePluginOptionsParser,
  definePluginModule,
  type PluginModuleInstance,
} from '@ultimabase/plugin-kit'

const module = definePluginModule({
  pluginId: 'community.packed',
  version: '1.0.0',
  core: '^1.0.0',
})
type PackedDefinition = Readonly<{
  readonly capabilities: Readonly<{
    readonly provides: readonly []
  }>
  readonly instanceId: 'editorial'
  readonly peers: readonly [{
    readonly pluginId: 'community.protocol'
    readonly version: '^1.0.0'
  }]
  readonly setup: () => Readonly<{ ready: true }>
}>
type PackedPlugin = PluginModuleInstance<typeof module, PackedDefinition>
const plugin: PackedPlugin = module.plugin({
  capabilities: { provides: [] },
  instanceId: 'editorial',
  peers: [{ pluginId: 'community.protocol', version: '^1.0.0' }],
  setup: () => ({ ready: true as const }),
})
export const packedInstance = plugin.manifest.identity.instanceId
export const packedCapabilities = plugin.manifest.capabilities.provides
export const packedPeer = plugin.peers?.[0]?.pluginId
declare const packedExports: PluginExports<PackedPlugin>
export const packedReady = packedExports.ready

const parseStandard = definePluginOptionsParser({
  name: 'packed workflow options',
  schema: z.strictObject({
    mode: z.enum(['review', 'publish']).default('review'),
  }),
})
export const packedOptions = parseStandard({})
`
const service = createLanguageService(fileName, source)

const readQuickInfo = (needle: string): string => {
	const position = source.indexOf(needle)
	if (position < 0)
		throw new TypeError(`Missing packed fixture text: ${needle}`)
	const info = service.getQuickInfoAtPosition(fileName, position)

	return info?.displayParts?.map(({ text }) => text).join('') ?? ''
}

describe('packed @ultimabase/plugin-kit authoring types', () => {
	it('preserves exact instance, capability, peer, and setup contracts', () => {
		expect(service.getSemanticDiagnostics(fileName)).toStrictEqual([])
		expect(readQuickInfo('packedInstance =')).toContain('"editorial"')
		expect(readQuickInfo('packedCapabilities =')).toContain('readonly []')
		expect(readQuickInfo('packedPeer =')).toContain('"community.protocol"')
		expect(readQuickInfo('packedReady =')).toContain('true')
		expect(readQuickInfo('packedOptions =')).toContain(
			'mode: "review" | "publish";',
		)
	})
})
