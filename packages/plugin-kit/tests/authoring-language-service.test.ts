import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { createLanguageService } from '../../../tooling/vitest/typescript-language-service.js'

const fileName = path.join(
	import.meta.dirname,
	'plugin-kit-authoring.fixture.ts',
)
const source = `
import {
  definePluginModule,
  stringField,
  type PluginModuleInstance,
} from '@ultimabase/core'
import { z } from 'zod'
import {
  definePluginOptionsParser,
  schemaPatch,
} from '../src/index.js'

const workflow = definePluginModule({
  pluginId: 'community.workflow',
  version: '1.0.0',
  core: '^1.0.0',
})

export const plugin = workflow.plugin({
  instanceId: 'editorial',
  setup: () => ({ ready: true as const }),
})

type WorkflowDefinition = Readonly<{
  readonly instanceId: 'editorial'
  readonly peers: readonly [{
    readonly pluginId: 'community.protocol'
    readonly version: '^1.0.0'
  }]
  readonly setup: () => Readonly<{ readonly ready: true }>
}>
type ExactWorkflowPlugin = PluginModuleInstance<
  typeof workflow,
  WorkflowDefinition
>
export const exactPlugin: ExactWorkflowPlugin = workflow.plugin({
  instanceId: 'editorial',
  peers: [{ pluginId: 'community.protocol', version: '^1.0.0' }],
  setup: () => ({ ready: true as const }),
})
export const exactInstance = exactPlugin.manifest.identity.instanceId

const parse = definePluginOptionsParser({
  name: 'workflow options',
  keys: ['enabled'] as const,
  normalize: ({ enabled }) => ({ enabled: enabled === true }),
})
export const options = parse({ enabled: true })

const parseStandard = definePluginOptionsParser({
  name: 'standard workflow options',
  schema: z.strictObject({
    enabled: z.boolean().default(true),
    mode: z.enum(['review', 'publish']).optional(),
  }),
})
export const standardOptions = parseStandard({})

export const patch = schemaPatch().addField({
  contributionId: 'state',
  name: 'state',
  field: stringField(),
})
`
const service = createLanguageService(fileName, source)

const readQuickInfo = (
	needle: string,
	offset = 0,
): Readonly<{
	display: string
	documentation: string
}> => {
	const position = source.indexOf(needle)
	if (position < 0) throw new TypeError(`Missing fixture text: ${needle}`)
	const info = service.getQuickInfoAtPosition(fileName, position + offset)

	return {
		display: info?.displayParts?.map(({ text }) => text).join('') ?? '',
		documentation: info?.documentation?.map(({ text }) => text).join('') ?? '',
	}
}

describe('@ultimabase/plugin-kit authoring language service', () => {
	it('preserves exact instance, option, and patch autocomplete', () => {
		expect(service.getSemanticDiagnostics(fileName)).toStrictEqual([])
		expect(
			readQuickInfo('workflow.plugin', 'workflow.'.length).display,
		).toContain('PluginModule<"community.workflow", "1.0.0", "^1.0.0">.plugin')
		expect(
			readQuickInfo('workflow.plugin', 'workflow.'.length).documentation,
		).toContain('Creates one immutable Core plugin definition')
		expect(readQuickInfo('options =').display).toContain('enabled: boolean;')
		expect(readQuickInfo('standardOptions =').display).toContain(
			'mode?: "review" | "publish" | undefined;',
		)
		expect(readQuickInfo('schema: z.strictObject').documentation).toContain(
			'Validates, defaults, and transforms options',
		)
		expect(readQuickInfo('PluginModuleInstance').documentation).toContain(
			'Derives one exact plugin type',
		)
		expect(readQuickInfo('exactInstance =').display).toContain('"editorial"')
		expect(readQuickInfo('addField').documentation).toContain(
			"Core's validated patch factory",
		)
	})
})
