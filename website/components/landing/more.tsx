// The data a model holds, the transactions around its writes, and what
// plugins add beyond reads and writes.
import { Example } from '../example'
import {
	Entries,
	Heading,
	Panel,
	Proof,
	Result,
	Row,
	Rows,
	Steps,
} from './parts'

export function Data() {
	return (
		<section className="ub-section" id="data">
			<Heading label="Data" split title="More than columns.">
				Typed fields of every kind, virtual fields computed on read, relations
				written and filtered in one call, and the queries a product needs.
			</Heading>
			<Proof
				panes={[
					{
						name: 'Virtual fields',
						code: (
							<Example
								file="models-and-queries/src/models.test.ts"
								region="virtual"
							/>
						),
						result: (
							<Result
								eyebrow="Computed on read"
								title="From the fields it needs"
							>
								<div className="ub-compute">
									<p className="ub-compute-in">
										<span>name: 'Mug'</span>
										<span>sku: 'MUG-001'</span>
									</p>
									<p className="ub-compute-out">
										<code>label</code> 'Mug (MUG-001)'
									</p>
									<p className="ub-compute-in">
										<span>price: '12.00'</span>
										<span>currency: 'USD'</span>
									</p>
									<p className="ub-compute-out">
										<code>priceIn</code> 13.20 USD
									</p>
								</div>
							</Result>
						),
					},
					{
						name: 'Relations',
						code: (
							<Example file="relations/src/queries.test.ts" region="include" />
						),
						result: (
							<Result eyebrow="include" title="An author, with books">
								<Rows>
									<Row
										name="books"
										value="['The Dispossessed', 'The Lathe of Heaven']"
									>
										Sorted and paged in the read
									</Row>
									<Row name="books[0].publisher" value="'Ace'">
										A relation of a relation
									</Row>
								</Rows>
							</Result>
						),
					},
				]}
			/>
			<div className="ub-columns">
				<Column
					label="Relations"
					entries={[
						['include', 'Related rows in the same read.', 'relations'],
						['connectOrCreate', 'Written in one call.', 'relations'],
						['some · every · none', 'Filtered through a list.', 'relations'],
					]}
				/>
				<Column
					label="Queries"
					entries={[
						['cursor', 'A page that starts at a row.', 'queries'],
						['search', 'Full text, best matches first.', 'queries'],
						['groupBy', 'Totals by value, with having.', 'queries'],
					]}
				/>
				<Column
					label="Writes"
					entries={[
						[
							'{ increment: 1 }',
							'A counter, changed in the database.',
							'queries',
						],
						['upsert', 'Updated, or created.', 'queries'],
						['createMany', 'Many rows in one call.', 'queries'],
					]}
				/>
			</div>
		</section>
	)
}

function Column({
	label,
	entries,
}: {
	readonly label: string
	readonly entries: readonly (readonly [string, string, string])[]
}) {
	return (
		<div className="ub-column">
			<p className="ub-group-name">{label}</p>
			<Entries
				className="ub-entries ub-stacked"
				entries={entries.map(([name, text, page]) => ({ name, text, page }))}
			/>
		</div>
	)
}

export function Transactions() {
	return (
		<section className="ub-section">
			<Heading
				label="Transactions"
				split
				title="Related writes. One transaction."
			>
				Writes inside <code>transaction()</code> commit together, or none of
				them does. A throw rolls them back.
			</Heading>
			<Proof
				panes={[
					{
						name: 'The function',
						code: (
							<Example file="transactions/src/functions.ts" region="transfer" />
						),
						result: (
							<Result eyebrow="transfer" title="Both writes, or neither">
								<Steps
									steps={[
										['Decrement', 'The sending account, locked until the end.'],
										['Check', 'A negative balance throws INSUFFICIENT_FUNDS.'],
										['Increment', 'The receiving account, in the same commit.'],
									]}
								/>
							</Result>
						),
					},
					{
						name: 'Commit',
						code: (
							<Example file="transactions/src/app.test.ts" region="commit" />
						),
						result: (
							<Result eyebrow="Balances" title="Committed">
								<Rows>
									<Row name="Before" value="[100, 0]">
										Two accounts
									</Row>
									<Row name="After" value="[70, 30]">
										Both writes saved
									</Row>
								</Rows>
							</Result>
						),
					},
					{
						name: 'Rollback',
						code: (
							<Example file="transactions/src/app.test.ts" region="rollback" />
						),
						result: (
							<Result eyebrow="Balances" title="Rolled back">
								<Rows>
									<Row name="transfer 130" off value="INSUFFICIENT_FUNDS">
										Refused after the decrement
									</Row>
									<Row name="After" value="[100, 0]">
										The decrement undone
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

export function Beyond() {
	return (
		<section className="ub-section" id="beyond">
			<Heading label="Beyond CRUD" split title="Go beyond reads and writes.">
				The official plugins add a trash, live data and files. Yours add fields,
				hooks, functions, sign-in or a transport the same way.
			</Heading>
			<div className="ub-panels">
				<Panel
					label="Soft delete"
					page="soft-delete"
					soft
					title="A delete you can undo"
				>
					<ol className="ub-states">
						<li>Visible</li>
						<li>In the trash</li>
						<li>Restored</li>
					</ol>
					<div className="ub-panel-code">
						<Example file="soft-delete/src/models.ts" region="post" />
					</div>
				</Panel>
				<Panel label="Your own plugin" page="plugins" title="Written like ours">
					<p className="ub-panel-text">
						<code>definePlugin</code> declares what a plugin brings; the kernel
						types it in every application that lists it.
					</p>
					<dl className="ub-levels">
						<dt>Models</dt>
						<dd>Fields, indexes, hooks and commands.</dd>
						<dt>Types</dt>
						<dd>Field types of its own, validated.</dd>
						<dt>Callers</dt>
						<dd>Identities, such as an API key.</dd>
						<dt>Serving</dt>
						<dd>Functions, routes and transports.</dd>
					</dl>
				</Panel>
			</div>
			<Entries
				entries={[
					{
						name: 'realtime',
						page: 'realtime',
						text: 'Live lists, rows and functions, over GraphQL subscriptions or SSE.',
					},
					{
						name: 'hooks',
						page: 'hooks',
						text: 'Code before and after each write, in its transaction or once it commits.',
					},
					{
						name: 'files',
						page: 'files',
						text: 'Uploads to S3-compatible storage, never orphaned.',
					},
				]}
			/>
		</section>
	)
}
