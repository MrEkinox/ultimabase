# Current plan: contribution-first plugin authoring

- Status: in-progress

The user authorized this complete authoring-form migration on 2026-09-25.
Creating a plugin must require one Core factory and one ordered contribution
list. Core derives internal phases, capability buckets, operation declarations,
and required privilege names from those contributions; authors keep explicit
human-readable privilege reasons.

Work through
[milestone 34](issues/3400-contribution-first-plugin-authoring/README.md) in
order. Preserve every current plugin capability, option, privilege, lifecycle,
transport, Typegen, schema, private-storage, and Runtime behavior. The public
surface may change, but the compiled application graph and its security
boundaries may not.

Each issue receives focused runtime and type tests, one dedicated local commit,
and a documentation-impact classification. Temporary compatibility inside the
branch may exist only between consecutive milestone commits; the final state
has one public `plugin()` factory and no public legacy authoring path. Do not
push without a separate request.
