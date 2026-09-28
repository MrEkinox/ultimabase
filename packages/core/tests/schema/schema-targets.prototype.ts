import {
	Schema,
	SchemaTargetResolutionError,
	type SchemaTarget,
	type SchemaTargetGraph,
} from '../../src/index.js'
import { UltimaBase } from '../../src/index.js'

const TargetUserSchema = Schema.define({
	className: 'TargetUser',
	fields: (field) => ({ name: field.string() }),
})

const /* hover:schema-target */ exactTarget: SchemaTarget<
		typeof TargetUserSchema
	> = () => TargetUserSchema

const application = new UltimaBase({
	schemas: [TargetUserSchema],
	plugins: [],
})
const graph: /* hover:target-graph */ SchemaTargetGraph =
	application.compile().schemas.schemaTargets
const /* hover:resolved-target */ resolved = graph.get(TargetUserSchema, [
		'friend',
	])
const error = new SchemaTargetResolutionError(
	'invalid-target',
	'TargetUser',
	['friend'],
	'Invalid target',
)
const /* hover:target-reason */ reason = error.reason

void exactTarget
void resolved
void reason
