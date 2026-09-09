import { immutableRecord } from '@ultimabase/shared'
import type { TypegenTypeNode } from '@ultimabase/core'

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
			for (const reference of [
				method.method,
				method.value,
				...(method.structuralContains === undefined
					? []
					: [method.structuralContains]),
			]) {
				references.set(
					`${reference.module}\u0000${reference.exportName}`,
					reference,
				)
			}
		}

		for (const schema of snapshot.schemas) {
			this.#collectFieldReferences(schema.fields, references)
			this.#collectFieldReferences(schema.virtualFields, references)
		}
		for (const option of snapshot.options) {
			this.#addReference(option.reference, references)
			if (option.compatibility !== undefined) {
				this.#addReference(option.compatibility, references)
			}
		}
		for (const operation of snapshot.operations) {
			if (operation.input !== undefined)
				this.#addReference(operation.input, references)
			if (operation.result !== undefined)
				this.#addReference(operation.result, references)
		}
		for (const contribution of snapshot.contributions) {
			for (const declaration of contribution.declarations) {
				this.#collectTypeNode(declaration.type, references)
			}
			for (const augmentation of contribution.augmentations) {
				for (const property of [
					...(augmentation.schema ?? []),
					...(augmentation.model ?? []),
				]) {
					this.#collectTypeNode(property.type, references)
				}
			}
		}
		for (const output of snapshot.outputs) {
			for (const declaration of output.declarations ?? []) {
				this.#collectTypeNode(declaration.type, references)
			}
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

	#addReference(
		reference: TypegenReference,
		references: Map<string, TypegenReference>,
	): void {
		references.set(
			`${reference.module}\u0000${reference.exportName}`,
			reference,
		)
	}

	#collectTypeNode(
		node: TypegenTypeNode,
		references: Map<string, TypegenReference>,
	): void {
		if (node.kind === 'reference') {
			this.#addReference(node.reference, references)
			for (const argument of node.arguments ?? []) {
				this.#collectTypeNode(argument, references)
			}
			return
		}
		if (node.kind === 'array') {
			this.#collectTypeNode(node.value, references)
			return
		}
		if (node.kind === 'tuple' || node.kind === 'union') {
			for (const value of node.values) this.#collectTypeNode(value, references)
			return
		}
		if (node.kind === 'object') {
			for (const property of node.properties) {
				this.#collectTypeNode(property.type, references)
			}
		}
	}

	#collectFieldReferences(
		fields: readonly TypegenFieldSnapshot[],
		references: Map<string, TypegenReference>,
	): void {
		for (const field of fields) {
			if (field.structuralContains !== undefined) {
				this.#addReference(field.structuralContains, references)
			}

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
