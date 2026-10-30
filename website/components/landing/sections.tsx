// The statement, the plugins, and users and their access.
import { Example } from '../example'
import {
	Arrow,
	Entries,
	Heading,
	Panel,
	Proof,
	Result,
	Row,
	Rows,
} from './parts'
import type { Entry } from './parts'

const capabilities = [
	['#plugins', 'Plugins & APIs', 'A small kernel, and what you add.'],
	['#users', 'Users & access', 'Sign-in, sessions, rules and roles.'],
	['#data', 'Data', 'Fields, relations, queries and transactions.'],
	['#beyond', 'Beyond CRUD', 'A trash, live lists, files, your plugins.'],
] as const

export function Statement() {
	return (
		<section className="ub-section ub-statement">
			<p>
				<strong>Write the model and its rules once.</strong> The plugins you
				list build on them: <strong>the APIs, sign-in, the database</strong>,
				and <strong>yours</strong>, each shown below with the example its tests
				run.
			</p>
			<nav aria-label="Capabilities" className="ub-capabilities">
				{capabilities.map(([href, name, text]) => (
					<a href={href} key={href}>
						<span>
							{name}
							<Arrow />
						</span>
						<small>{text}</small>
					</a>
				))}
			</nav>
		</section>
	)
}

const plugins: readonly (readonly [string, readonly Entry[]])[] = [
	[
		'Serve',
		[
			{ name: 'http', page: 'http', text: 'The server, and your routes.' },
			{ name: 'graphql', page: 'graphql', text: 'A GraphQL API.' },
			{ name: 'rest', page: 'rest', text: 'A REST API and its OpenAPI.' },
		],
	],
	[
		'Store',
		[
			{ name: 'postgres', page: 'postgres', text: 'Sync and migrations.' },
			{ name: 'memory()', page: 'memory', text: 'For a start and the tests.' },
		],
	],
	[
		'Identify',
		[
			{ name: 'auth', page: 'auth', text: 'Sessions, cookie or Bearer.' },
			{ name: 'password', page: 'password', text: 'Sign-up and sign-in.' },
		],
	],
	[
		'Authorize',
		[
			{ name: 'roles', page: 'roles', text: 'Roles that inherit others.' },
			{ name: 'acl', page: 'acl', text: 'Who reads and writes each row.' },
		],
	],
	[
		'Extend',
		[
			{ name: 'files', page: 'files', text: 'Uploads, never orphaned.' },
			{ name: 'realtime', page: 'realtime', text: 'Live lists and rows.' },
			{ name: 'soft-delete', page: 'soft-delete', text: 'A dated trash.' },
		],
	],
]

export function Plugins() {
	return (
		<section className="ub-section ub-composition" id="plugins">
			<div>
				<Heading
					label="Plugins"
					title={
						<>
							A small kernel. <em>Room for your stack.</em>
						</>
					}
				>
					The kernel holds the models, the queries and the rules. The server,
					the APIs, sign-in and the databases are plugins: an application lists
					the ones it uses, and yours are written the same way.
				</Heading>
				<div className="ub-directory">
					{plugins.map(([group, entries]) => (
						<div className="ub-group" key={group}>
							<p className="ub-group-name">{group}</p>
							<Entries className="ub-entries ub-compact" entries={entries} />
						</div>
					))}
				</div>
			</div>
			<Proof
				className="ub-proof ub-dark"
				panes={[
					{
						name: 'In memory',
						code: <Example file="introduction/src/app.ts" region="app" />,
					},
					{
						name: 'On PostgreSQL',
						code: <Example file="postgres/src/app.ts" region="app" />,
					},
				]}
			>
				The models stay the same: the database is one line of the application.
			</Proof>
		</section>
	)
}

export function Users() {
	return (
		<section className="ub-section" id="users">
			<Heading
				label="Users & access"
				split
				title="Who signs in. Who sees what."
			>
				Sign-in is two plugins, and access a rule beside each model and field.
				Every API and your server code apply the same rules.
			</Heading>
			<div className="ub-panels">
				<Panel label="Sessions" page="password" soft title="Sign-in, done">
					<ol className="ub-lifecycle">
						<li>
							<b>Sign up</b> An email and a password, hashed with Argon2id.
						</li>
						<li>
							<b>Sign in</b> A session, by HttpOnly cookie or Bearer token.
						</li>
						<li>
							<b>Verify, reset</b> Links valid 24 hours and 1 hour.
						</li>
						<li>
							<b>Sign out</b> Ends the session and clears the cookie.
						</li>
					</ol>
				</Panel>
				<Panel label="Access" page="access" title="Rules at every level">
					<dl className="ub-levels">
						<dt>Operations</dt>
						<dd>Who reads, creates, updates and deletes.</dd>
						<dt>Rows</dt>
						<dd>A filter every read joins.</dd>
						<dt>Fields</dt>
						<dd>Hidden or read-only, by caller.</dd>
						<dt>Each row</dt>
						<dd>An ACL by user, by role or for the public.</dd>
						<dt>Roles</dt>
						<dd>That inherit others, in your rules.</dd>
					</dl>
				</Panel>
			</div>
			<Proof
				panes={[
					{
						name: 'Bearer token',
						code: (
							<Example
								file="password-sign-in/src/sessions.test.ts"
								region="bearer"
							/>
						),
						result: (
							<Result eyebrow="viewer" title="The token is the user">
								<Rows>
									<Row name="With the token" value="{ name: 'Ada' }">
										Signed in
									</Row>
									<Row name="Without" off value="null">
										Anonymous
									</Row>
								</Rows>
							</Result>
						),
					},
					{
						name: 'Cookie',
						code: (
							<Example
								file="password-sign-in/src/sessions.test.ts"
								region="cookie"
							/>
						),
						result: (
							<Result eyebrow="viewer" title="A browser needs nothing">
								<Rows>
									<Row name="signIn" value="HttpOnly; SameSite=Lax">
										Sets the cookie
									</Row>
									<Row name="Next request" value="{ name: 'Ada' }">
										Sent back by the browser
									</Row>
									<Row name="signOut" off value="Max-Age=0">
										Ends the session
									</Row>
								</Rows>
							</Result>
						),
					},
				]}
			/>
		</section>
	)
}
