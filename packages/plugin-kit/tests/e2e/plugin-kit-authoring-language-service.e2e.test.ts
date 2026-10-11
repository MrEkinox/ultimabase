import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { createLanguageService } from '../../../../tooling/vitest/typescript-language-service.js'

const fileName = path.join(
	import.meta.dirname,
	'plugin-kit-authoring.packed.fixture.ts',
)
const source = `
import { UltimaBase, type SchemaItem } from '@ultimabase/core'
import { contributeApplication, contributeDeclarations, plugin, type PluginExports } from '@ultimabase/core/plugin'
import { z } from 'zod'
import {
  definePluginFieldOption,
  definePluginOptionsParser,
} from '@ultimabase/plugin-kit'

const highlighted = definePluginFieldOption({
  contexts: ['stored'],
  normalize: (value) => value === true,
  protocolVersion: 1,
  typegen: false,
})

const definition = plugin({
  id: 'community.packed',
  version: '1.0.0',
  core: '^1.0.0',
  instanceId: 'editorial',
  peers: [{ pluginId: 'community.protocol', version: '^1.0.0' }],
  permissions: { 'schema:declare': 'Declares the packed field option.' },
  contributions: [
    contributeDeclarations({
      schema: ({ schemas }) => schemas.defineOptions({
        contributionId: 'highlighted',
        field: { highlighted },
      }),
    }),
    contributeApplication(() => ({ exports: { ready: true as const } })),
  ],
})
const Application = UltimaBase.use(definition)
const Article = Application.Schema.define({
  className: 'PackedPluginKitArticle',
  fields: (field) => ({ title: field.string({ highlighted: true }) }),
})
declare const packedArticle: SchemaItem<typeof Article>
export const packedTitle = packedArticle.title
export const packedInstance = definition.manifest.identity.instanceId
export const packedCapabilities = definition.manifest.capabilities.provides
export const packedPeer = definition.peers?.[0]?.pluginId
declare const packedExports: PluginExports<typeof definition>
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
		// TypeScript renders an empty inferred capability list as readonly never[].
		expect(readQuickInfo('packedCapabilities =')).toContain('readonly never[]')
		expect(readQuickInfo('packedPeer =')).toContain('"community.protocol"')
		expect(readQuickInfo('packedReady =')).toContain('true')
		expect(readQuickInfo('packedOptions =')).toContain(
			'mode: "review" | "publish";',
		)
		expect(readQuickInfo('packedTitle =')).toContain('string')
	}, 20_000)
})
