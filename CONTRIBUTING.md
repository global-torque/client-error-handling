# Contributing

Use an issue or RFC before making a public API change. Keep pull requests
focused, add tests for changed behavior, update user-facing documentation, and
record compatibility or security impact explicitly.

## Developer Certificate of Origin

Every commit must include a `Signed-off-by` trailer certifying the Developer
Certificate of Origin 1.1. Sign commits with:

```sh
git commit -s
```

By signing off, you certify that you wrote the contribution or otherwise have
the right to submit it under the repository license. The full certificate is
available at <https://developercertificate.org/>.

## Pull requests

1. Branch from the protected default branch.
2. Install the package manager version declared by `packageManager`.
3. Run the repository's `pnpm run ci` command.
4. Explain public API, compatibility, privacy, and supply-chain impact.
5. Do not commit generated package output unless the repository policy names
   it as source.

Security reports must use GitHub private vulnerability reporting, not a public
issue.

## Retained release and npm provenance

The candidate workflow builds and packs once, runs the package and installed
artifact gates, and retains the exact archive, checksums, manifest, and hosted
build attestation in a draft prerelease. Every tag follows this draft path.

For an ordinary version, dispatch the npm provenance workflow from protected main
for that release tag (after its candidate workflow succeeds):

```sh
gh workflow run npm-provenance.yml --ref main -f release_tag=v0.1.0
```

Replace the example with the package version being released. The workflow
requires the matching tag and a still-draft release. It checks the source commit,
archive hashes, and original hosted candidate attestation before signing the
single npm package identity and attaching `npm-provenance.json`. It never
rebuilds the package, replaces an existing bundle, or publishes the release.

A maintainer verifies the retained archive and both attestations, completes the
named real-consumer gate and public release issue, then publishes the reviewed
draft as an ordinary GitHub release. Publish those same archive bytes to npm with
`npm publish <archive.tgz> --access public --provenance-file <npm-provenance.json>`.
Keep the original build attestation alongside the npm identity bundle. npm
credentials remain outside these workflows.

The npm identity workflow runs from protected main and checks out the selected
release tag explicitly. Its signature identifies the reviewed workflow revision;
the retained candidate signature and manifest identify the original package
source revision. Both signatures must verify before publication.
