# GitHub PR Workflow Reference

Load this only when a skill needs GitHub pull request mechanics. Keep high-level workflow decisions in the invoking skill.

## Parse A PR Reference

Accepted forms:
- `#N` or `N`
- `https://github.com/OWNER/REPO/pull/N`

If the argument is absent, first try the current branch:

```sh
gh pr view --json number,url,baseRefName,headRefName,state
```

If no PR is associated with the current branch, ask for a PR reference. Do not guess a PR number from recent history.

## Resolve Repository Context

Prefer the current checkout:

```sh
gh repo view --json nameWithOwner --jq .nameWithOwner
gh pr view <N> --json number,state,url,title,body,baseRefName,headRefName,headRefOid
```

For GraphQL calls, derive `owner` and `repo` from `nameWithOwner`.

## Checkout And Refresh

For workflows that modify the PR branch:

```sh
gh pr checkout <N>
git pull
git fetch origin <baseRefName>
```

Review and self-review workflows should inspect local `HEAD` against `origin/<baseRefName>` so local commits made during the run are included:

```sh
git diff --name-status origin/<baseRefName>...HEAD
git diff origin/<baseRefName>...HEAD -- <path>
```

Use `gh pr view` for PR metadata. Do not use `gh pr diff <N>` as the review target after local review commits have been created but not pushed.

## Safety Rules

- Never force-push from an automated workflow.
- Never run `git reset --hard` unless the user explicitly asks.
- If local and remote branches have diverged, stop and ask.
- If a workflow is about to rewrite local commits, first prove the range contains only commits created by that workflow.
- If tracked files are modified before an automated publish workflow, stop and ask what belongs in the PR.
- Stage explicit paths. Avoid `git add -A` when unrelated untracked files exist.

## Common Status Commands

```sh
git status --short --branch
git rev-parse --abbrev-ref HEAD
git rev-parse --abbrev-ref --symbolic-full-name @{u}
git log --oneline origin/<baseRefName>..HEAD
```

Use command output in summaries when it affects safety or user action.
