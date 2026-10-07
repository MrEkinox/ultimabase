import type {
	TypegenFieldSnapshot,
	TypegenSchemaSnapshot,
} from '../snapshot.js'
import type { GeneratedIdentifiers } from './identifiers.js'
import type { ReferenceImports } from './imports.js'

export interface ObjectDescriptor {
	readonly alias: string
	readonly field: TypegenFieldSnapshot
	readonly ownerPath: string
	readonly schema: TypegenSchemaSnapshot
}

export interface EnumDescriptor {
	readonly alias: string
	readonly field: TypegenFieldSnapshot
	readonly ownerPath: string
	readonly schema: TypegenSchemaSnapshot
}

export interface ObjectOccurrence {
	readonly descriptor: ObjectDescriptor
	readonly field: TypegenFieldSnapshot
	readonly schema: TypegenSchemaSnapshot
}

export interface RenderContext {
	readonly identifiers: GeneratedIdentifiers
	readonly imports: ReferenceImports
	readonly schemasByName: ReadonlyMap<string, TypegenSchemaSnapshot>
}
