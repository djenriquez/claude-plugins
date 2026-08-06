# Humanizer Patterns

Load from the `djenriquez-core:humanizer` skill. Pattern catalog only — process
and modes live in `skills/humanizer/SKILL.md`. Reported-work tone lives in
`references/reporting-style.md`. Procedure craft lives in
`skills/technical-writing/SKILL.md` and loads only when authoring docs a reader
follows.

Forked from abatilo-core humanizer / [Wikipedia: Signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing),
plus engineering-specific tells common in agent-written PRs and reviews.
Refined by abatilo's later split: drop always-on STE word caps and checklists
that make models clip meaning to satisfy a number.

## Core rule

Fix contamination. Do not repaint clean text. Prefer concrete subjects and
verbs. Prefer what a reviewer can verify from the diff.

**Meaning outranks plainness.** Plainer wording is only worth having when it
still says the same thing. Preserve identifiers, sequence, and normative force
(must / should / may).

**Brevity means fewer ideas**, not compressed notation. Expand
`Fixed: timeout → retry path → green` into whole sentences; do not enforce
numeric word caps while generating.

---

## Engineering AI-speak (priority for PR/review text)

These show up constantly in agent-written engineering prose. Prefer the rewrite.

| Avoid | Prefer |
|-------|--------|
| leverages / utilizes | uses |
| facilitates | lets / allows / does |
| streamlines | removes a step / cuts X |
| enhances / improves (vague) | name the measurable change |
| robust / seamless / holistic / comprehensive | drop, or name the actual property |
| ensures that | state the mechanism: "rejects …", "retries …" |
| enables X to | "X can" / "X now …" |
| in order to | to |
| it is important to note that | (delete; state the fact) |
| this PR introduces / this change introduces | lead with the subject: "The runner …" |
| carefully / cleanly / simply / just | delete adverbs that sell quality |
| end-to-end (when not literal) | name the path |
| surface area (when vague) | name modules, APIs, or flows |
| aligns with best practices | say which practice, or delete |
| provides the ability to | can |
| serves as a | is |
| acts as a | is / does |
| makes it easier to (journey) | state the end behavior unless base-branch contrast is real |

**Heavy terminology trap:** dumping internal type names, package paths, and
protocol jargon into the first paragraph. Summary/Intent layers need plain
language; symbols belong in Details / What changed / appendix.

**Before (PR summary):**
> This PR introduces a comprehensive refactoring of the orchestration layer,
> leveraging a robust middleware pipeline that streamlines request handling and
> ensures seamless alignment with our resiliency best practices across the
> `WorkflowExecutor` and `RetryPolicyResolver` subsystems.

**After:**
> Retries were applied after the worker had already acked the message, so a
> crash mid-handler could drop work. The worker now nacks on retryable failure
> and only acks after the handler finishes.

---

## Content patterns (general AI writing)

### 1. Significance inflation

Watch: stands/serves as, is a testament/reminder, vital/crucial/pivotal role,
underscores/highlights its importance, reflects broader, symbolizing, setting
the stage, key turning point, evolving landscape, indelible mark.

Cut the "why this matters to the universe" sentence. Keep the concrete fact.

### 2. Notability claims

Watch: independent coverage, leading expert, active social media presence,
industry-leading (without evidence).

Replace with a specific source or delete.

### 3. Superficial -ing tails

Watch: highlighting…, ensuring…, reflecting…, contributing to…, fostering…,
showcasing… tacked on after a complete sentence.

Delete the tail or turn it into a second concrete sentence.

### 4. Promotional language

Watch: boasts, vibrant, profound, groundbreaking, renowned, stunning,
nestled, in the heart of, rich (figurative).

Engineering variant: "powerful", "elegant", "clean architecture", "modern".
Stay neutral.

### 5. Vague attributions

Watch: industry reports, observers have noted, experts argue, some critics say
(with no citation).

Name the source or drop the claim.

### 6. Formulaic challenges/outlook

Watch: Despite its… faces several challenges… Despite these challenges…
Future Outlook / The future looks bright.

Replace with one specific risk or omit.

---

## Language patterns

### 7. High-frequency AI vocabulary

Additionally, align with, crucial, delve, emphasizing, enduring, enhance,
fostering, garner, highlight (verb), interplay, intricate, key (adj),
landscape (abstract), pivotal, showcase, tapestry, testament, underscore,
valuable, vibrant.

One occurrence in natural prose can be fine. A cluster is a rewrite signal.

### 8. Copula avoidance

serves as / stands as / marks / represents / boasts / features / offers →
is / has / does.

### 9. Negative parallelisms

"Not only… but…", "It's not just about… it's…". Flatten to one claim.

### 10. Rule of three

Forced triples for a comprehensive feel. Keep only the items that earn space.

### 11. Synonym cycling

Same referent renamed every sentence (the protagonist / main character /
central figure). Pick one name.

### 12. False ranges

"from X to Y" when X and Y are not on a scale. List the actual items.

---

## Style patterns

### 13. Em dash overuse

One em dash per paragraph is fine; stacks of them are a tell. Prefer commas,
parentheses, or a second sentence.

### 14. Bold and emoji decoration

Mechanical **Label:** bullets and emoji ornaments (🚀 💡 ✅). Use plain
markdown; section headers only when the host format needs them (PR body
sections are fine; inline review comments are not).

### 15. Title Case, curly quotes

Sentence case for headings. Straight quotes.

### 16. Chatbot artifacts

I hope this helps, Of course!, Certainly!, You're absolutely right!, Great
question!, Let me know if…, Here is a…, knowledge-cutoff hedges.

### 17. Filler

- "In order to achieve this goal" → "To achieve this"
- "Due to the fact that" → "Because"
- "At this point in time" → "Now"
- "In the event that" → "If"
- "has the ability to" → "can"
- "It is important to note that" → (delete)

### 18. Excessive hedging and empty endings

"It could potentially possibly be argued…" / "Exciting times lie ahead."
Cut. End on a specific fact or nothing.

### 19. Agent shorthand and compressed notation

Watch: arrow chains (`A → B → green`), stacked labels without verbs, telegram
fragments that require the session to decode.

Rewrite as complete sentences with an explicit subject and outcome. This is
reporting-style, not "make it longer."

### 20. Invented verification

Watch: "tests pass", "fully verified", "production-ready" without tool or repo
evidence in the draft or session.

Demote to what was actually observed, or remove. Do not invent a green build
while humanizing.

### 21. Normative force drift

Watch: "must" softened to "should" / "might want to", or a suggestion hardened
into a requirement, solely for tone.

Keep the original force of the claim. Cleanup is not policy change.

### 22. Synonym-as-second-component

Engineering form of synonym cycling: the same service called "the worker",
then "the runner", then "the executor" in one PR body. Pick the repository
term and repeat it.

---

## Mode-specific checks

Three skim checks for every reporting mode (not a long ritual checklist):

1. First sentence gives the outcome.
2. A cold reader would understand without the session.
3. No invented verification, softened requirements, or same-thing-renamed-twice.

### pr-body

- [ ] Three skim checks above
- [ ] Summary readable without opening the repo
- [ ] No journey language relative to intermediate commits
- [ ] No quality-advertising adverbs
- [ ] Implementation symbols pushed out of Summary
- [ ] Test plan items are runnable, not "monitor prod"
- [ ] No arrow-chain shorthand

### review-comment

Main review body (when present):

- [ ] Qualitative skim: closeness to approve + how much work remains
- [ ] Themes, not a dump of every inline finding
- [ ] No `**Severity: label**` wrapper; no `#` headers; no filler preamble

Inline finding:

- [ ] Sounds like a senior engineer typing into GitHub
- [ ] Starts with bold `**Severity: short label**` then blank line then body
- [ ] No `#` headers; severity not repeated in body prose
- [ ] Code/logic refs use inline backticks; prose stays plain English
- [ ] Opens on defect/risk/question, not a paraphrase of the hunk
- [ ] Usually 1–2 sentences (3 only for a real tradeoff); nits often one
- [ ] Impact in runtime/API/correctness terms; no happy-path setup
- [ ] No "I noticed" / "Consider" / "It might be worth considering"
- [ ] Technical claim force preserved

### digest / spec-narrative

- [ ] Three skim checks above
- [ ] First section answers why/what in plain language
- [ ] Neutral tone; no evaluation-as-praise
- [ ] Spec: appendix untouched; prefer fewer ideas over growing length

### pr-reply

- [ ] One to two sentences
- [ ] Starts with Fixed/Addressed/Skipped or equivalent fact
- [ ] No gratitude padding
- [ ] Fix claimed only when the change exists

---

## Voice note

Stripping slop must not produce sterile mush *or* forced personality.

- **PR bodies, digests, specs:** clear, neutral, specific. Reporting register.
  Not a blog post. Not an aircraft manual.
- **Review comments and replies:** calm teammate voice. Direct, not theatrical.
- **Procedures/references:** technical-writing craft; humanizer only cleans AI
  tells.
- **General prose:** keep genuine voice that was already present; do not invent
  first-person confessional style for engineering docs.

---

## Full engineering example

**Before:**
> ## Summary
>
> This PR introduces a comprehensive enhancement to our authentication
> middleware, leveraging a robust token-refresh pipeline that streamlines
> session continuity and ensures seamless user experiences across the platform.
> Additionally, it carefully aligns retry behavior with industry best practices,
> underscoring our commitment to reliability in an evolving landscape.
>
> ## What changed
>
> - **Resiliency:** We refactored the flow, making it cleaner and more robust.
> - **DX:** Improved developer experience by simplifying the mental model.
> - **Observability:** Enhanced logging to better surface issues.

**After:**
> ## Summary
>
> Access tokens were refreshed only on the next user request, so a tab left
> open past expiry got a hard 401. The middleware now refreshes in the
> background one minute before expiry and retries the original request once
> after a successful refresh.
>
> ## What changed
>
> - `auth/middleware.ts` — schedule proactive refresh; on 401 from expiry,
>   refresh and retry the request once before failing.
> - `auth/token_store.ts` — single-flight refresh so concurrent requests share
>   one token update.
> - Tests for expiry-during-flight and double-request refresh races.
