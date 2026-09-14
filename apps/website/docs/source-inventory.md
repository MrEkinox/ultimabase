# Public documentation source inventory

This inventory maps the current repository to the planned public site without
treating existing prose as publishable by default. The page-level mapping and
ownership live in `content/documentation-plan.json`.

The maintained package-to-section routing lives in
`content/documentation-ownership.json`. Every public package appears exactly
once there; an area may point reviewers to several principal website sections.
The map is a review index, while each page's `sources` remains its precise
content evidence.

## Source classes

| Source                          | Best use                                                      | Limitation                                                                       |
| ------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `README.md`                     | Product position, workspace map, and first commands           | Too compressed to be the beginner tutorial                                       |
| `ARCHITECTURE.md`               | Package boundaries, application graph, and Runtime model      | Engineering-facing and too dense for first-use pages                             |
| `docs/PRODUCT_SPEC.md`          | Product promises and explicit non-goals                       | Not a package-level API reference                                                |
| `packages/*/README.md`          | Canonical package purpose, setup, and current public contract | Depth and tutorial quality vary by package                                       |
| `packages/*/src/index.ts`       | Authoritative availability of public exports                  | Names alone do not explain behavior or safe usage                                |
| `packages/core/docs/*.md`       | Detailed schema, query, Runtime, and access semantics         | Some material is internal or organized by implementation domain                  |
| `packages/core/examples/schema` | Focused schema and mutation examples                          | Snippets need a runnable application context                                     |
| `examples/minimal`              | Canonical runnable first application and API setup            | Does not demonstrate every optional capability                                   |
| `examples/todo-backend`         | Broader application scenario                                  | Must be checked against the current minimal architecture before reuse            |
| `docs/adr`                      | Decision rationale, invariants, and historical context        | Never the primary learning path; accepted history may include superseded choices |
| `issues`                        | Shipped acceptance evidence and known documentation gaps      | Planning language is not a public compatibility promise                          |
| Tests                           | Executable evidence for edge cases and regressions            | Not a canonical prose contract and may rely on test-only helpers                 |

## Sitemap coverage

| Public area              | Primary sources                                                     | Readiness | Editorial treatment                                                   |
| ------------------------ | ------------------------------------------------------------------- | --------- | --------------------------------------------------------------------- |
| Getting Started          | Root README, `examples/minimal`, Core and PostgreSQL exports        | Ready     | Turn the runnable path into one fixed beginner journey                |
| Model Your Data          | Core schema guide and schema examples                               | Ready     | Split lookup detail from mental models and task guidance              |
| Read Data                | Core query guide and query sources                                  | Ready     | Preserve immutable Query semantics and typed results                  |
| Write Data               | Runtime guide, nested-write examples, persistence plugins           | Ready     | Make transaction and itemized-operation boundaries visible            |
| Secure Your Application  | Access guide and authentication, Access, Roles, ACL package READMEs | Ready     | Present independent plugins; never imply identity grants access       |
| Expose APIs              | HTTP, REST, GraphQL, Yoga, and Hono package READMEs                 | Ready     | Show sibling transports entering one application execution boundary   |
| Plugins                  | Architecture, plugin-kit, testing, and capability ADRs              | Ready     | Teach a compact plugin before privileges and lifecycle detail         |
| Operate Your Application | Provider READMEs, example configuration, release guide              | Partial   | Synthesize lifecycle and secrets; production guarantees need review   |
| Guides                   | Official plugin READMEs and maintained examples                     | Partial   | Validate each end-to-end combination before publication               |
| Concepts                 | Architecture, product spec, Runtime guide, and ADRs                 | Ready     | Translate internal reasoning into stable public mental models         |
| Troubleshooting          | Package limitations, error contracts, and issue evidence            | Partial   | Build symptom-led diagnostics from verified failures only             |
| Reference                | Package READMEs and public export barrels                           | Ready     | Document exports, defaults, errors, and examples without deep imports |
| Examples                 | Minimal and todo applications                                       | Ready     | Keep scenarios runnable and link each step to its owning guide        |
| Status                   | Root status, changesets, release guide, milestone issues            | Partial   | Separate shipped, pre-release, and planned behavior explicitly        |

## Known gaps and unsuitable shortcuts

- A complete production checklist is not yet a single guaranteed public
  contract. The Operations owner must reconcile provider lifecycle, secrets,
  migrations, observability, and deployment assumptions before publishing it.
- The repository has an agent workflow but no contributor-facing contribution
  guide. `AGENTS.md` is useful internal context, not a public contribution page.
- Pre-release packages do not justify stable support or compatibility promises.
  The status pages must stay explicit until the release process establishes
  them.
- Package READMEs and ADRs must not be copied wholesale. Public pages need a
  reader outcome, current terminology, verified examples, and a deliberate
  release-status label.
- Source files and tests may confirm an edge case, but public exports and package
  contracts remain the boundary. If they conflict, repair the owning contract
  before documenting the implementation detail.

The `sourceStatus` values in the machine-readable plan make these gaps visible
to validation and later authoring issues.
