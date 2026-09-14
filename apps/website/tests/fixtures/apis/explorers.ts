import { apolloSandboxPlugin } from '@ultimabase/apollo-sandbox-plugin'
import { graphiqlPlugin } from '@ultimabase/graphiql-plugin'

export const explorers = [
	graphiqlPlugin({ environment: 'development' }),
	apolloSandboxPlugin({ environment: 'development' }),
]
