<!-- generated-by: groundrules v1.10.0 -->
# Release — mcp-freestyle

Publishing is automated: push a tag, GitHub Actions publishes to npm. There is no token to
manage and no 2FA prompt — the registry trusts this repository and this workflow directly.

## One-time setup (required before the first automated release)

On [npmjs.com/package/mcp-freestyle](https://www.npmjs.com/package/mcp-freestyle) →
**Settings** → **Trusted Publisher**, add a GitHub Actions publisher:

| Field | Value |
|---|---|
| Repository | `lozit/mcp-freestyle` |
| Workflow filename | `publish.yml` |
| Environment | *(leave empty)* |

Until this exists, `.github/workflows/publish.yml` fails at its final step. Nothing else in
the pipeline depends on it.

## Cutting a release

```bash
# 1. Land everything, including the CHANGELOG entry for the new version.
#    README, CHANGELOG and LICENSE ship inside the tarball — npm only refreshes
#    them on a new version, so they must be true *before* the tag.

# 2. Bump, tag and push. `npm version` writes package.json and creates the tag.
npm version patch          # or minor / major
git push --follow-tags
```

The tag push triggers `publish.yml`, which:

1. checks the tag matches `package.json` — a mismatch publishes the wrong version under the
   right name, and no later commit undoes that;
2. runs typecheck, the test suite and the build;
3. refuses to publish a README that still advertises the package as unpublished;
4. boots the built server and asserts it serves both tools;
5. publishes with provenance.

Then cut the GitHub release:

```bash
gh release create "v$(node -p "require('./package.json').version")" --generate-notes
```

## What can go wrong

| Symptom | Cause |
|---|---|
| Publish step fails on authentication | The trusted publisher above is not configured, or the workflow filename does not match it exactly |
| `You cannot publish over the previously published versions` | The version was already published. Bump again; npm never lets a version be replaced |
| Tag/version mismatch error | `npm version` was skipped and the tag was created by hand |

## Publishing by hand

Only if Actions is unavailable. Requires the security key on the account, and the URL npm
prints must be opened from a real terminal — it does not survive being piped:

```bash
npm publish --access public
```
