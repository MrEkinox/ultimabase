/** Invalidates generated fingerprints when Core's shared typegen ABI changes. */
export const generatedApplicationContractVersion = 1 as const

/** Carries one field's exact generated values without executable behavior. */
export interface GeneratedFieldContract<
	TObject = unknown,
	TCreate = unknown,
	TUpdate = unknown,
	TWhere = unknown,
	TPath = unknown,
> {
	readonly create: TCreate
	readonly object: TObject
	readonly paths: TPath
	readonly update: TUpdate
	readonly where: TWhere
}

/** Names one embedded object's exact generated operation shapes. */
export interface GeneratedObjectContract<TObject, TCreate, TUpdate, TPath> {
	readonly create: TCreate
	readonly object: TObject
	readonly paths: TPath
	readonly update: TUpdate
}

/** Records a generated relationship target without loading it. */
export interface GeneratedRelationshipContract<
	TTarget extends string,
	TCardinality extends 'many' | 'one',
> {
	readonly cardinality: TCardinality
	readonly target: TTarget
}

/** Supplies exact value shapes later consumed by generated schema Access typing. */
export interface GeneratedSchemaAccessContract<
	TItem,
	TCreate,
	TUpdate,
	TWhere,
	TOrderBy,
> {
	readonly create: TCreate
	readonly item: TItem
	readonly orderBy: TOrderBy
	readonly update: TUpdate
	readonly where: TWhere
}

/** Supplies exact value shapes later consumed by generated schema hook typing. */
export interface GeneratedSchemaHookContract<TItem, TCreate, TUpdate> {
	readonly create: TCreate
	readonly item: TItem
	readonly originalItem: TItem
	readonly update: TUpdate
}

/** Structural boundary implemented by every generated application schema entry. */
export interface GeneratedSchemaContract {
	readonly Access: GeneratedSchemaAccessContract<
		unknown,
		unknown,
		unknown,
		unknown,
		unknown
	>
	readonly Create: unknown
	readonly FieldBuilder: object
	readonly Fields: Readonly<Record<string, GeneratedFieldContract>>
	readonly Hooks: GeneratedSchemaHookContract<unknown, unknown, unknown>
	readonly Include: unknown
	readonly Item: unknown
	readonly Objects: Readonly<
		Record<string, GeneratedObjectContract<unknown, unknown, unknown, unknown>>
	>
	readonly OrderBy: unknown
	readonly Pointers: Readonly<
		Record<string, GeneratedRelationshipContract<string, 'one'>>
	>
	readonly Relations: Readonly<
		Record<string, GeneratedRelationshipContract<string, 'many'>>
	>
	readonly Select: unknown
	readonly Update: unknown
	readonly Where: unknown
}

/** Structural boundary implemented by one deterministic generated application. */
export interface GeneratedApplicationContract {
	readonly FieldBuilder: object
	readonly fingerprint: string
	readonly schemas: Readonly<Record<string, GeneratedSchemaContract>>
}
