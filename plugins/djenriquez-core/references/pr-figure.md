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
- Neither image generation nor a local deterministic renderer is available.
- The evidence cannot establish a correct graph, or the deterministic fallback
  cannot produce a legible, verified figure. Report the concrete limitation.

A failed image-generation attempt is a reason to use the deterministic
fallback, not by itself a reason to skip. Deliver one verified PNG and say
which rendering path produced it. Do not generate a second "hero" image.

## What to draw

Match the change, not a house style of boxes-for-everything:

- Multi-actor or protocol change: architecture / sequence with labeled arrows.
- Bug fix: the failing path vs the path this PR creates, when that contrast
  exists **on the base branch**.
- API or policy change: who calls whom, with the new constraint visible.

Frame it like the PR body: **merged end state relative to the base branch**.
Do not draw the implementation journey, discarded designs, or future work.

## Record the graph

Before generating, write a small actor list and an edge table grounded in the
PR evidence. Give actors stable IDs and record each required edge as
`edge ID | source ID | destination ID | label`. Record meaningful boundaries
and the actor or edge each callout describes. Keep this alongside the prompt
in a temporary file; do not commit it by default.

Choose a focused view with few actors and edges. Group nodes only when doing
so preserves the behavior being explained. Once the graph is recorded, layout
changes must not remove required edges, merge distinct endpoints, or invent
intermediate hops. If the evidence changes, update the graph before rendering.

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
<Stable IDs and exact labels from the recorded graph. Include any boundaries
that affect its meaning.>

Directed edges
<Copy the edge table. Each arrow must start at its source and end, with its
arrowhead, at its destination. A line passing through another actor implies
an extra hop: route around it. Label every edge unambiguously.>

Arrow styles
<Assign styles to existing edge IDs only. Use dashed lines for setup/probes
when the evidence supports that distinction. Styling must not change endpoints.>

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

## Verify and recover

Inspect the actual pixels before uploading or embedding any candidate. Trace
**every required edge** from its source to its arrowhead and compare it with
the edge table. Check labels, actor membership in boundaries, and callout
attachment points. Also look for extra arrows or implied hops absent from the
graph. An ambiguous crossing or hidden arrowhead fails verification; visual
polish and correct box labels cannot compensate for wrong connections.

Generate once. If it fails verification, make one targeted correction that
names the mismatched edge IDs and their required endpoints. Keep the recorded
graph fixed and recheck the entire corrected image: editing one arrow can move
another. If neither candidate passes, stop image generation and use the
fallback below. Never select the candidate merely because it has fewer errors.

For example, if the graph says `e1 | client | api | request` and
`e2 | api | store | read`, a drawing with `client → store` fails even when all
three boxes and both labels are present. Reversing `e2`, assigning a callout to
the wrong actor, or joining both edges into an unlabeled junction also fails.

## Deterministic fallback

Render the recorded graph with code when the correction fails, or when there
is no image generator. Use an available local renderer: Graphviz or Mermaid
for explicit directed edges, or SVG with explicitly positioned boxes, paths,
and arrowheads. Convert the result to PNG with an available local renderer or
browser screenshot. Use the renderer's source IDs to preserve endpoints; do
not send the failed bitmap through image generation again to redraw its arrows.

Keep the presentation simple: readable labels, generous spacing, no decorative
connections. Inspect the final PNG using the same verification above. Code
rendering preserves specified connections but does not prove the source graph
matches the diff or that the layout is legible. Fix source/layout mistakes
before uploading. Keep source and PNG in temporary storage. Deliver the PNG
through the existing attachment workflow, and identify it as code-rendered;
a Mermaid code fence alone is not the hosted figure.

Use tools already available in the harness. Do not install plugins, send the
graph to a public rendering service, or weaken attachment access checks to
make the fallback work. If no local renderer can produce a verified PNG,
report the limitation and retain the graph source for the user.

## Harness (image generation)

Inspect available tools and use the generator for **this** harness (do not
reach for another product's image tool when the session already has one):

| Harness | Generator |
|---------|-----------|
| **Cursor** | Native `GenerateImage`. `aspect_ratio: "16:9"`. Put landscape, white background, and the title in `description`. After it returns, use the saved file path (move out of the workspace if the tool dropped it there). |
| **Codex** | Installed `imagegen` skill / built-in `image_gen`. Put landscape and white background in the prompt. Copy the chosen file out of `$CODEX_HOME/generated_images/` to a temp path before upload. Do not switch to that skill's CLI fallback unless the user asked. |
| **Claude Code** | No native raster generator. Use a native image tool if the session has one. Else Codex `imagegen` / `codex` CLI if already available. Do not install plugins to unblock publish. |

If none of those exist, use the deterministic fallback. Do not block the PR
when neither rendering path is available.

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

The script prints the asset URL on stdout only after access checks pass.
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

| Repository visibility | Authenticated GET | Anonymous GET |
|---|---|---|
| Public | `200` with image content | `200` with image content |
| Private or internal | `200` with image content | `401`, `403`, or `404` |

A private attachment's anonymous `404` is expected only when authenticated
retrieval succeeds. Timeouts, server errors, and login pages do not establish
that the image is both readable and protected. The helper stops on a mismatch;
do not widen repository access or retry through a public host to make it pass.
Publish only the stable `github.com/user-attachments/assets/...` URL, never a
signed download redirect, token, or session cookie.

If a private/internal upload is anonymously readable, stop and report the
possible exposure and attachment URL to the user so it can be removed in
GitHub or through GitHub support. Withholding the PR link does not undo an
upload. Do not retry hosting after this failure. These checks confirm access
at upload time; they cannot guarantee future repository visibility or test
every other user's permissions.

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
