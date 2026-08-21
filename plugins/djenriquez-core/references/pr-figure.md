# PR Figure Reference

Load this from `pr-publish` when drafting or refreshing a pull request body.
The figure is for a busy reviewer: Summary plus picture should explain the
change before they open the diff.

Worked example: [coreweave/aviato#1782](https://github.com/coreweave/aviato/pull/1782)
(DNS-name HTTPS egress — declare, steer, SNI allowlist).

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
reviewer will see. Cardinality (one fleet vs one-per-tenant).>

Do not draw
<Rejected designs, future work, and lookalikes the model will otherwise
invent. This list is mandatory whenever the change is easy to confuse with a
sibling design.>

Actors / boxes
<Numbered. Nested bullets only for internals that affect the picture.>

Control-plane arrows
<Admission, persist, place, configure. Omit this band when there is no
control plane in the change.>

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
  must appear (`*.pypi.org`, `443`, `HPA min 1`).
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

The figure belongs in the **PR body**, not in the merge, unless the change
already adds a doc/spec asset (then save it next to that doc, as #1782 did
under `docs/specs/assets/`).

Preferred: GitHub user-attachments, which do not require a git commit.

From the `djenriquez-core` plugin root (the directory that contains
`.claude-plugin/`, `skills/`, and `references/` as siblings):

```sh
python3 skills/pr-publish/scripts/upload_github_asset.py "$FIGURE_PATH"
```

The script prints the asset URL on stdout. Embed it after the Summary
paragraphs, before `## What changed`:

```markdown
![<figure title>](<url>)
```

If the script is missing, run the same upload inline: `gh repo view` for
`nameWithOwner`, `gh api repos/<owner>/<repo> --jq .id` for the numeric id,
`gh auth token` for the bearer token, then `POST` the file bytes to
`https://uploads.github.com/user-attachments/assets?name=<file>&content_type=<mime>&repository_id=<id>`
with `Accept: application/json`. Read `url` from the JSON (fall back to
`href` or `asset.href`). This endpoint is unofficial; if it fails, do not
scrape `github.com` cookies to work around it.

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
