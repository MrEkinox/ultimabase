import { immutableRecord } from '@ultimabase/shared'

import type {
	TypegenApplicationSnapshot,
	TypegenFieldSnapshot,
	TypegenReference,
} from '../snapshot.js'
import { quote, typeIdentifier } from './syntax.js'

interface ReferenceImport {
	readonly alias: string
	readonly exportName: string
	readonly module: string
}

/** Collects stable aliases for every external type referenced by the output. */
export class ReferenceImports {
	readonly #aliases = new Map<string, string>()
	readonly #imports: ReferenceImport[]

	constructor(snapshot: TypegenApplicationSnapshot) {
		const references = new Map<string, TypegenReference>()

		for (const method of snapshot.fieldMethods) {
			for (const reference of [method.method, method.value]) {
				references.set(
					`${reference.module}\u0000${reference.exportName}`,
					reference,
				)
			}
		}

		for (const schema of snapshot.schemas) {
			this.#collectFieldReferences(schema.fields, references)
		}

		const modules = [
			...new Set([...references.values()].map(({ module }) => module)),
		].sort()
		this.#imports = [...references.values()]
			.sort((left, right) =>
				left.module === right.module
					? left.exportName.localeCompare(right.exportName)
					: left.module.localeCompare(right.module),
			)
			.map((reference) => {
				const moduleIndex = modules.indexOf(reference.module)
				const alias = `Plugin${String(moduleIndex)}_${typeIdentifier(reference.exportName)}`

				this.#aliases.set(
					`${reference.module}\u0000${reference.exportName}`,
					alias,
				)

				return immutableRecord({ ...reference, alias })
			})
	}

	#collectFieldReferences(
		fields: readonly TypegenFieldSnapshot[],
		references: Map<string, TypegenReference>,
	): void {
		for (const field of fields) {
			if (field.value.kind === 'plugin') {
				references.set(
					`${field.value.reference.module}\u0000${field.value.reference.exportName}`,
					field.value.reference,
				)
			}

			if (field.value.kind === 'object') {
				this.#collectFieldReferences(field.value.fields, references)
			}
		}
	}

	alias(reference: TypegenReference): string {
		const alias = this.#aliases.get(
			`${reference.module}\u0000${reference.exportName}`,
		)

		if (alias === undefined) {
			throw new TypeError(
				`Missing generated import for ${reference.module}:${reference.exportName}`,
			)
		}

		return alias
	}

	render(): string {
		const byModule = new Map<string, ReferenceImport[]>()

		for (const entry of this.#imports) {
			const entries = byModule.get(entry.module) ?? []

			entries.push(entry)
			byModule.set(entry.module, entries)
		}

		return [...byModule.entries()]
			.map(([module, entries]) => {
				const specifiers = entries
					.map(({ alias, exportName }) => `\t${exportName} as ${alias},`)
					.join('\n')

				return `import type {\n${specifiers}\n} from ${quote(module)}`
			})
			.join('\n')
	}
}
