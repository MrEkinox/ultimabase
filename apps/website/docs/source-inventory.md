# Public documentation source inventory

This inventory maps the current repository to the private preview of the public
site without treating existing prose as publishable by default. The page-level mapping and
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
| `examples/modeling`             | Canonical runnable first application: Core and PostgreSQL     | No HTTP API; `examples/full-stack` adds REST, GraphQL and authentication         |
| `examples/todo-backend`         | Broader application scenario                                  | Must be checked against the current minimal architecture before reuse            |
| `docs/adr`                      | Decision rationale, invariants, and historical context        | Never the primary learning path; accepted history may include superseded choices |
| `ROADMAP.md`                    | Proposed directions and their archived issue context          | Planning language is not a public compatibility promise                          |
| Tests                           | Executable evidence for edge cases and regressions            | Not a canonical prose contract and may rely on test-only helpers                 |

## Sitemap coverage

| Public area              | Primary sources                                                    | Readiness | Editorial treatment                                                  |
| ------------------------ | ------------------------------------------------------------------ | --------- | -------------------------------------------------------------------- |
| Introduction             | Root README, `examples/modeling`, Core and PostgreSQL exports      | Partial   | Keep the manual path runnable; mark automatic setup unavailable      |
| Core                     | Schema examples, Core source and guides, Runtime and security ADRs | Ready     | Own native modeling, reads, writes, Runtime, and authority           |
| Plugins                  | Official package READMEs, plugin-kit, testing, and capability ADRs | Ready     | Keep optional setup and limitations with the owning plugin           |
| Guides                   | Testing README, Manual Installation, maintained tests              | Partial   | Teach concrete application tasks without repeating package reference |
| Operate Your Application | Provider READMEs, example configuration, release guide             | Partial   | Give a pre-exposure checklist and symptom-led startup diagnostics    |
| Reference                | Package READMEs and public export barrels                          | Ready     | Keep package and compatibility lookup outside task pages             |
| Project                  | Root status, changesets, release guide, contribution guide         | Partial   | Separate shipped, pre-release, and planned behavior explicitly       |

## Known gaps and unsuitable shortcuts

- The public pre-exposure checklist is a verification aid, not a deployment
  template or production guarantee. Applications still own backups, migration
  review, observability, and host-specific shutdown behavior.
- `CONTRIBUTING.md` and `/docs/1.0.0/project/contributing` are the contributor-facing path.
  `AGENTS.md` remains an internal agent contract, not a public tutorial.
- Pre-release packages do not justify stable support or compatibility promises.
  The Project pages must stay explicit until the release process establishes
  them.
- Package READMEs and ADRs must not be copied wholesale. Public pages need a
  reader outcome, current terminology, verified examples, and a deliberate
  release-status label.
- Source files and tests may confirm an edge case, but public exports and package
  contracts remain the boundary. If they conflict, repair the owning contract
  before documenting the implementation detail.

The `sourceStatus` values in the machine-readable plan make these gaps visible
to validation and later authoring issues.
