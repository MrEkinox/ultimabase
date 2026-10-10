import { expect, it } from 'vitest'

import * as publicApi from '../src/index.js'

it('exports only the deliberate GraphQL application surface', () => {
	expect(Object.keys(publicApi).sort()).toStrictEqual([
		'GraphqlBase64',
		'GraphqlBigInt',
		'GraphqlDate',
		'GraphqlDateTime',
		'GraphqlDecimal',
		'GraphqlJSON',
		'GraphqlSafeInt',
		'GraphqlSchemaCompilationError',
		'GraphqlTime',
		'GraphqlUUID',
		'graphqlApplicationCapability',
		'graphqlFieldProtocol',
		'graphqlOperationProtocol',
		'graphqlPlugin',
		'graphqlProtocol',
		'graphqlSchemaContributionsCapability',
		'provideGraphqlSchemas',
	])
})
