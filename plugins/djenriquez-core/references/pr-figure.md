# PR Figure Reference

Load this from `pr-figure` (standalone or via `pr-publish`) when producing a
reviewer diagram. The figure is for a busy reviewer: Summary plus picture
should explain the change before they open the diff.

Worked example: [djenriquez/claude-plugins#34](https://github.com/djenriquez/claude-plugins/pull/34)
(standalone `/pr-figure` — comment, body, or URL; `--repo` upload; no commit).

## Why a picture

A reviewer who only reads prose will reconstruct the architecture in their
head, often wrongly. One grounded diagram removes that work. It is not
decoration, a changelog illustration, or a screenshot of code.

## When to skip

Produce **one** figure by default. Skip only when:

- The diff has no behavior, flow, architecture, or user-visible outcome to
  draw (lockfile, format-only, typo, generated-only).
- This harness has no raster generator (see Harness).
- Two generation attempts still invent a rejected design or omit a load-bearing
  actor — a misleading picture is worse than none.

Say so in the publish output. Do not substitute Mermaid and call it the same
artifact. Do not generate a second "hero" or marketing image.

## What to draw

Match the change, not a house style of boxes-for-everything:

- Multi-actor or protocol change: architecture / sequence with labeled arrows.
- Bug fix: the failing path vs the path this PR creates, when that contrast
  exists **on the base branch**.
- API or policy change: who calls whom, with the new constraint visible.

Frame it like the PR body: **merged end state relative to the base branch**.
Do not draw the implementation journey, discarded designs, or future work.

## Prompt (the load-bearing step)

Image models invent architecture when the prompt is a vibe. Write a spec, not
a caption. A one-liner like "draw a diagram of this PR" is how you get a
generic cloud picture. Ground every box and arrow in the humanized Summary
plus `git diff <base>...HEAD`. If a name, arrow, or component is not in that
evidence, omit it. The "Do not draw" list is what keeps sibling designs (and
future work) out of the figure.

Use this skeleton. Fill it from the change; do not keep placeholder prose.

```text
Draw a clean architecture diagram for <one-line subject>. Landscape, white
background, few colors, labeled boxes and arrows. No marketing art, no 3D,
no isometric city, no screenshots of IDEs.

What this is
<5–10 sentences. End-state behavior. What is unchanged. Concrete names a
reviewer will see. Cardinality (one figure per PR; one attachment).>

Do not draw
<Rejected designs, future work, and lookalikes the model will otherwise
invent. This list is mandatory whenever the change is easy to confuse with a
sibling design.>

Actors / boxes
<Numbered. Nested bullets only for internals that affect the picture.>

Control-plane arrows
<Who invokes whom: publish → figure, figure → upload. Omit this band when
there is no control flow in the change.>

Data-plane arrows — two styles
<Happy / granted path in one color. The other real path in a second color
(not "unauthorized" unless that is the actual outcome). Dashed for a
startup/probe/once path.>

Annotations (short callouts)
<Invariants a reviewer would otherwise miss: cardinality, freeze rules,
protocol limits, what does *not* enforce.>

Layout
<Horizontal bands or a before/after split. Name what sits in each band.>

Title the figure: <short title, also used as markdown alt text>
```

Label discipline:

- Few boxes. Short labels (one to three words). Quote verbatim any string that
  must appear (`--repo`, `comment`, `body`).
- Ask for large unobscured text. Do not pack paragraphs into the figure.
- Component names belong here; function and type names do not.

Generate **once**. Read the image. Retry **once** if it invented a "Do not
draw" item, dropped a numbered actor, or came out as marketing art. Prefer the
attempt with fewer invented boxes. Then stop.

## Harness (raster generator)

Inspect available tools and use the generator for **this** harness (do not
reach for another product's image tool when the session already has one):

| Harness | Generator |
|---------|-----------|
| **Cursor** | Native `GenerateImage`. `aspect_ratio: "16:9"`. Put landscape, white background, and the title in `description`. After it returns, use the saved file path (move out of the workspace if the tool dropped it there). |
| **Codex** | Installed `imagegen` skill / built-in `image_gen`. Put landscape and white background in the prompt. Copy the chosen file out of `$CODEX_HOME/generated_images/` to a temp path before upload. Do not switch to that skill's CLI fallback unless the user asked. |
| **Claude Code** | No native raster generator. Use a native image tool if the session has one. Else Codex `imagegen` / `codex` CLI if already available. Do not install plugins to unblock publish. |

If none of those exist, skip the figure and report it. Do not block the PR.

Write the file under `$TMPDIR` / `/tmp` when you control the path so it does
not show up as an untracked repo binary. Delete a workspace copy after a
successful upload unless the commit fallback below applies.

## Host the file (no surprise commit)

The figure is hosted as a GitHub user-attachment, not in the merge, unless
the change already adds a doc/spec asset (then save it next to that doc).
`pr-publish` embeds it in the PR body; standalone `/pr-figure` posts a
comment unless asked otherwise. #34 hosted the figure as an attachment and
did not commit a PNG.

Preferred: GitHub user-attachments, which do not require a git commit.

From the `djenriquez-core` plugin root (the directory that contains
`.claude-plugin/`, `skills/`, and `references/` as siblings). Pass `--repo`
when the current checkout is not the PR's repository:

```sh
python3 skills/pr-figure/scripts/upload_github_asset.py "$FIGURE_PATH" --repo OWNER/REPO
```

The script prints the asset URL on stdout after the repository-scoped upload
succeeds and any private/internal exposure checks pass.
Delivery (`comment` / `body` / `url`) is owned by `skills/pr-figure/SKILL.md`.
For a PR body, embed after
the Summary paragraphs, before `## What changed`:

```markdown
![<figure title>](<url>)
```

Use the PR's base repository even when the branch belongs to a fork or the
current checkout is elsewhere. The helper reads its numeric ID and visibility
before sending file bytes and passes that ID as `repository_id` to GitHub's
user-attachments endpoint. GitHub assigns access from the repository; there
is no separate public/private upload flag. This is also how the
[GitHub CLI uploader](https://github.com/cli/cli/blob/trunk/internal/attachments/client.go)
selects the destination repository. Unknown visibility stops the upload.

[GitHub's attachment access rules](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/attaching-files)
determine the checks:

| Repository visibility | Upload | Before posting |
|---|---|---|
| Public | Repository-scoped `201` | No download prerequisite |
| Private or internal | Repository-scoped `201` | `401`, `403`, or `404` |

A repository-scoped `201` confirms upload success. Raw attachment downloads
do not necessarily reflect rendering on a PR: public uploads can return `404`,
and an API token can receive an organization's browser SSO page for a valid
private attachment. Do not make either download a posting gate. After posting,
verify rendering on the PR when a browser is available, signed in for a
private/internal repository. Otherwise, report upload and posting success
without claiming rendering was verified.

Private/internal attachments must deny anonymous access. An anonymous `404`
is expected; timeouts and server errors leave protection unverified, so the
helper stops. Do not widen repository access or retry through a public host
to make it pass.
Publish only the stable `github.com/user-attachments/assets/...` URL, never a
signed download redirect, token, or session cookie.

If a private/internal upload is anonymously readable, stop and report the
possible exposure and attachment URL to the user so it can be removed in
GitHub or through GitHub support. Withholding the PR link does not undo an
upload. Do not retry hosting after this failure. These checks detect anonymous
exposure at upload time; they cannot establish rendering, guarantee future
repository visibility, or test every reader's permissions.

If the user requires a non-public figure and the repository is public, skip
uploading. If the helper is missing, keep the file local rather than bypassing
its checks with an inline upload. Do not scrape GitHub cookies.

Skip upload and use the commit fallback only when:

- The host is not `github.com` (user-attachments URL above is github.com), or
- Upload returns a non-201 and the PR already contains a doc/spec asset path
  for this figure.

Commit fallback (explicit path only; working tree must otherwise be clean):
add the PNG next to the spec/doc, push, and use a blob URL at the pushed
commit (`https://github.com/<owner>/<repo>/blob/<sha>/<path>?raw=true`).
Do not invent a new binaries directory on a code PR. Do not force-push.
Do not `git add -A`.

If both hosting paths fail, publish without the figure. Report the local path
so the user can drop it into the GitHub UI.

## Refresh

When updating an existing PR, regenerate if the Summary's outcome or the
end-state flow changed. Otherwise keep the existing `![...](...)`. Never
leave two figures in the body.
