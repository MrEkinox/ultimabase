import type {
	SchemaItem,
	SchemaDefinition,
	SchemaResult,
} from '../../schema/index.js'

import type { QueryFieldName, QuerySchemaNode } from '../ast/contracts.js'
import type {
	OperationAstNode,
	OperationIncludedField,
	OperationSelectedField,
} from './contracts.js'
import type { QueryRecord, QueryResult } from '../query/result.js'

type OperationResultMode = 'model' | 'record'
type OperationInclusionMode = 'hydrated' | 'pointer'

/** Reads the schema retained by a query-backed or schema-backed terminal. */
type OperationSchema<TOperation> = TOperation extends {
	readonly query: { readonly schema: QuerySchemaNode<infer TSchema> }
}
	? TSchema
	: TOperation extends { readonly schema: QuerySchemaNode<infer TSchema> }
		? TSchema
		: never

type QueryObjectResult<
	TSchema extends SchemaDefinition,
	TSelectedField extends QueryFieldName<TSchema>,
	TMode extends OperationResultMode,
	TIncludedPointer,
	TInclusionMode extends OperationInclusionMode,
> = TMode extends 'model'
	? QueryResult<TSchema, TSelectedField, TIncludedPointer>
	: QueryRecord<
			TSchema,
			TSelectedField,
			TInclusionMode extends 'hydrated' ? TIncludedPointer : never
		>

/** Projects one terminal's selected (and optionally included) object shape. */
type OperationObjectResult<
	TOperation extends OperationAstNode,
	TMode extends OperationResultMode,
	TInclusionMode extends OperationInclusionMode,
	TIncludedPointer = OperationIncludedField<TOperation>,
> = QueryObjectResult<
	OperationSchema<TOperation>,
	Extract<
		OperationSelectedField<TOperation>,
		QueryFieldName<OperationSchema<TOperation>>
	>,
	TMode,
	TIncludedPointer,
	TInclusionMode
>

/** Bulk creates and upserts return complete objects without an explicit selection. */
type BulkObjectResult<
	TOperation extends OperationAstNode,
	TMode extends OperationResultMode,
	TInclusionMode extends OperationInclusionMode,
> = [OperationSelectedField<TOperation>] extends [never]
	? TMode extends 'model'
		? SchemaResult<OperationSchema<TOperation>>
		: SchemaItem<OperationSchema<TOperation>>
	: OperationObjectResult<TOperation, TMode, TInclusionMode, never>

/** Maps every terminal to either its neutral Runtime record or public model result. */
type OperationResultFor<
	TOperation extends OperationAstNode,
	TMode extends OperationResultMode,
	TInclusionMode extends OperationInclusionMode,
> = TOperation extends { readonly kind: 'count' }
	? number
	: TOperation extends { readonly kind: 'exists' }
		? boolean
		: TOperation extends { readonly kind: 'find-many' }
			? readonly OperationObjectResult<TOperation, TMode, TInclusionMode>[]
			: TOperation extends {
						readonly kind: 'find-one' | 'update-one' | 'delete-one'
				  }
				? OperationObjectResult<TOperation, TMode, TInclusionMode> | null
				: TOperation extends {
							readonly kind: 'get' | 'create-one' | 'upsert-one'
					  }
					? OperationObjectResult<TOperation, TMode, TInclusionMode>
					: TOperation extends {
								readonly kind: 'update-many' | 'delete-many'
						  }
						? readonly OperationObjectResult<
								TOperation,
								TMode,
								TInclusionMode,
								never
							>[]
						: TOperation extends {
									readonly kind: 'create-many' | 'upsert-many'
							  }
							? readonly BulkObjectResult<TOperation, TMode, TInclusionMode>[]
							: never

/** Maps every normalized terminal intent to its exact public model result. */
export type OperationResult<TOperation extends OperationAstNode> =
	OperationResultFor<TOperation, 'model', 'hydrated'>

/** Maps every normalized terminal to its exact hydrated Runtime record. */
export type OperationRecordResult<TOperation extends OperationAstNode> =
	OperationResultFor<TOperation, 'record', 'hydrated'>

/** Maps every normalized terminal to the adapter record before pointer hydration. */
export type OperationSourceRecordResult<TOperation extends OperationAstNode> =
	OperationResultFor<TOperation, 'record', 'pointer'>
