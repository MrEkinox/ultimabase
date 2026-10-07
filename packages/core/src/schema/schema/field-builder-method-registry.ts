import {
	assertNonEmptyString,
	immutableArray,
	immutableRecord,
} from '@ultimabase/shared'

import { builtInFieldKinds } from '../fields/base/kinds.js'
import { mapFieldDeclarationContexts } from './field-contexts.js'
import {
	assertPluginFieldFamily,
	resolvePluginFieldFamilyContext,
	type FieldBuilderMethodResolver,
	type OwnedFieldBuilderMethod,
	type OwnedPluginFieldType,
	type PluginFieldFamilyDefinition,
	type PluginFieldFamilyRegistrar,
	type PluginFieldTypegen,
} from './field-builder-methods.js'
import { pluginSourceReceipt } from '../../plugins/source-projections.js'

const reservedMethodNames: ReadonlySet<string> = new Set([
	'add',
	...builtInFieldKinds,
	'virtual',
])

/** Owns the plugin method and generated field-type sets for one application. */
export class FieldBuilderMethodRegistry implements FieldBuilderMethodResolver {
	readonly #methods = new Map<string, OwnedFieldBuilderMethod>()
	readonly #fieldTypes: OwnedPluginFieldType[] = []
	#closed = false
	#snapshot: readonly OwnedFieldBuilderMethod[] | undefined
	#fieldTypeSnapshot: readonly OwnedPluginFieldType[] | undefined

	/** Opens one transactional owner-bound registration session. */
	beginPluginDeclaration(pluginName: string): Readonly<{
		fields: PluginFieldFamilyRegistrar
		commit(): void
		close(): void
	}> {
		assertNonEmptyString(pluginName, 'pluginName')
		if (this.#closed) {
			throw new TypeError('FieldBuilder method registration is already closed')
		}

		const stagedMethods = new Map<string, OwnedFieldBuilderMethod>()
		const stagedFieldTypes: OwnedPluginFieldType[] = []
		let sessionClosed = false
		const assertSessionOpen = (): void => {
			if (sessionClosed || this.#closed) {
				throw new TypeError(
					'Plugin field family declaration facade is already closed',
				)
			}
		}
		const stageType = (
			fieldKind: string,
			typegen: PluginFieldTypegen,
		): void => {
			stagedFieldTypes.push(
				immutableRecord({ fieldKind, owner: pluginName, typegen }),
			)
		}

		const fields: PluginFieldFamilyRegistrar = immutableRecord({
			register: (family: PluginFieldFamilyDefinition) => {
				assertSessionOpen()
				assertPluginFieldFamily(
					family,
					`Plugin field family from ${pluginName}`,
				)
				const builder = family.builder
				if (builder === undefined) {
					stageType(family.fieldKind, family.typegen)
					return pluginSourceReceipt()
				}
				if (reservedMethodNames.has(builder.name)) {
					throw new TypeError(
						`FieldBuilder method "${builder.name}" from "${pluginName}" conflicts with "@ultimabase/core"`,
					)
				}
				const existing =
					stagedMethods.get(builder.name) ?? this.#methods.get(builder.name)
				if (existing !== undefined) {
					throw new TypeError(
						`FieldBuilder method "${builder.name}" from "${pluginName}" conflicts with "${existing.owner}"`,
					)
				}

				const contexts = mapFieldDeclarationContexts((context) => {
					const declaration = builder.contexts[context]
					if (declaration === undefined) return undefined
					const resolved = resolvePluginFieldFamilyContext(family, declaration)
					// Only persisted value contexts contribute generated value types.
					if (context === 'stored' || context === 'embedded') {
						stageType(resolved.fieldKind, declaration.typegen ?? family.typegen)
					}
					return resolved
				})
				stagedMethods.set(
					builder.name,
					immutableRecord({ contexts, name: builder.name, owner: pluginName }),
				)
				return pluginSourceReceipt()
			},
		})

		return immutableRecord({
			fields,
			commit: (): void => {
				assertSessionOpen()
				this.#fieldTypes.push(...stagedFieldTypes)
				for (const [name, method] of stagedMethods) {
					this.#methods.set(name, method)
				}
				stagedMethods.clear()
				stagedFieldTypes.length = 0
			},
			close: (): void => {
				sessionClosed = true
				stagedMethods.clear()
				stagedFieldTypes.length = 0
			},
		})
	}

	close(): void {
		if (this.#closed) return
		this.#closed = true
		this.#snapshot = immutableArray([...this.#methods.values()])
		this.#fieldTypeSnapshot = immutableArray(this.#fieldTypes)
	}

	get(name: string): OwnedFieldBuilderMethod | undefined {
		if (!this.#closed) {
			throw new TypeError('FieldBuilder method registration is not closed')
		}
		return this.#methods.get(name)
	}

	values(): readonly OwnedFieldBuilderMethod[] {
		if (this.#snapshot === undefined) {
			throw new TypeError('FieldBuilder method registration is not closed')
		}
		return this.#snapshot
	}

	/** Reads the immutable generated value contracts after declaration closes. */
	fieldTypes(): readonly OwnedPluginFieldType[] {
		if (this.#fieldTypeSnapshot === undefined) {
			throw new TypeError('Plugin field type registration is not closed')
		}
		return this.#fieldTypeSnapshot
	}
}
