// Keep Yoga and application schemas in one transformed GraphQL realm.
export const graphqlRuntimeDependencies: (string | RegExp)[] = [
	'graphql',
	'graphql-yoga',
	/^@envelop\//u,
	/^@graphql-tools\//u,
	/^@graphql-yoga\//u,
]
