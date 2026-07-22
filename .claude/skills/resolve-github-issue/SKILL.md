---
name: resolve-github-issue
description: Investigate and fix a GitHub issue in the current repo end-to-end — fetch it with gh, plan for anything non-trivial, implement, verify at runtime, and commit with a closing reference. Use when the user says "look at issue #N", "fix issue #N", or "work on issue #N".
---

# Resolve a GitHub issue

Process to follow, not a fix to apply blindly — the actual change still requires
real investigation each time.

## 1. Fetch the issue

```
gh issue view <N>
```

Read the title, body, and comments. If the ask is ambiguous or looks stale
(references code that no longer exists), say so and ask before proceeding
rather than guessing.

## 2. Understand current behavior before touching anything

Search the codebase for what the issue is actually describing. For anything
spanning more than one or two known files, delegate to an Explore/general
agent rather than grepping piecemeal — hand it the issue text verbatim plus
what "done" looks like, and ask for concrete file:line references back.

## 3. Scope the change

- **Trivial** (typo, one-line, obviously-correct fix): just make it.
- **Non-trivial** (multiple files, an architectural choice, ambiguous
  requirements): use `EnterPlanMode`. Ground the plan in what you actually
  read in step 2 — cite real file:line references, not assumptions. Call
  out what's explicitly out of scope. Get the plan approved via
  `ExitPlanMode` before writing code.

## 4. Implement

Follow existing patterns in the touched files. Typecheck/build as you go,
but that's not verification — see next step.

## 5. Verify at runtime

Run the repo's `verify` skill if one exists. Do not skip this and call it
done from typecheck alone.

- If verification will exercise code that reads/writes real local state —
  a settings file, a database, anything under the user's actual data
  directory rather than a fixture — **back it up first** and restore it
  byte-for-byte afterward.
- A dev instance of the app may already be running. Before closing/killing
  any window or process, correlate it by more than a name/title match (e.g.
  start time vs. when you launched your own test instance) — an ambiguous
  match should get blocked or, when genuinely ambiguous, ask the user
  rather than guessing which process is safe to touch.
- Prefer driving the real interface (clicks/keystrokes/HTTP requests) over
  calling internal APIs directly — calling an exposed function straight
  from a script can bypass the actual code path you're trying to test.

## 6. Commit

Only commit if the user asked you to (general rule, not specific to
issues). Reference the issue so merging closes it automatically:

```
git commit -m "$(cat <<'EOF'
<summary of the fix>

Fixes #<N>
EOF
)"
```

Use `Fixes #<N>` only if the change actually resolves the issue completely;
use `Refs #<N>` if it's partial or related work.

## 7. Push and confirm closure

Pushing is a shared/remote action — only do it if the user explicitly asks,
same as any other push. Check this repo's branching convention first (direct
commits to the default branch vs. a PR flow) rather than assuming; run
`git fetch` / `git log HEAD..origin/<branch>` and rebase onto any upstream
commits rather than force-pushing.

After pushing, confirm the issue actually closed:

```
gh issue view <N> --json state
```

Report the final state back to the user — don't assume the `Fixes #N`
reference took effect.
