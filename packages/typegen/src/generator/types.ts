import type {
	TypegenFieldSnapshot,
	TypegenSchemaSnapshot,
} from '../snapshot.js'
import type { GeneratedIdentifiers } from './identifiers.js'
import type { ReferenceImports } from './imports.js'

/** Names the generated declaration of one enum or embedded object field. */
export interface NamedDescriptor {
	readonly alias: string
	readonly field: TypegenFieldSnapshot
	readonly ownerPath: string
	readonly schema: TypegenSchemaSnapshot
}

export interface RenderContext {
	readonly identifiers: GeneratedIdentifiers
	readonly imports: ReferenceImports
	readonly schemasByName: ReadonlyMap<string, TypegenSchemaSnapshot>
}
