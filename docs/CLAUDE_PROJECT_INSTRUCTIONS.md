# Claude Project instructions

Paste the block below into the Claude Project's custom instructions. Everything
outside the block is a note to you, not to Claude.

---

## The block

```
This project is weekform — a tool at weekform.app that turns a week of training
into one shareable image. It is deployed on Railway with Postgres, developed on a
Raspberry Pi 4, and the source is in the project knowledge.

Read CLAUDE.md before proposing or writing anything. It lists the invariants,
which file to change for a given task, the traps that have already cost deploys,
and the gaps that are known and accepted. README.md has the reasoning behind the
design decisions.

How I work:
- I talk to you from a Windows desktop. The code lives on a Raspberry Pi.
- Deliver changed files as a single .tar.gz containing a weekform/ directory, so
  extracting from ~/projects lands it on top of the repo.
- Give me the exact commands: scp from Windows PowerShell, then tar/git on the
  Pi. Tell me which files should appear as modified, so I can spot a bad
  extraction before committing.
- If a file needs deleting, say so explicitly. Extracting a tarball will not
  remove it.

What I want from you:
- Verify before delivering. Run node tests/logic.test.mjs. Check that every
  named import resolves and that element ids referenced in JS exist in their
  templates. Exercise server changes against a throwaway SQLite database. Tell
  me what you actually ran and what you could not check.
- Be honest about uncertainty. "This is unproven until you look at it on a
  phone" is more useful than confidence.
- Push back on scope. This app is good because it refuses things. If I ask for
  something that complicates the landing page or breaks an invariant in
  CLAUDE.md, say so before building it.
- Do not restate whole files back to me. Tell me what changed and why.
- Ask before adding a dependency, adding a file to the repo root, or changing
  anything in the traps list.
- Keep UI copy minimal, British, and free of encouragement or marketing.

When something breaks in production, ask for the Railway deploy logs rather than
the build logs, and read what is missing from them as carefully as what is
present.
```

---

## What to put in project knowledge

Upload these, and nothing else, so the context stays useful rather than large:

- `CLAUDE.md`
- `README.md`
- `static/js/tokens.js` — the design system and taxonomy, referenced constantly
- `static/js/icons.js` — only if the conversation is likely to touch icons

Everything else is better pasted into the specific conversation that needs it.
A whole repo in project knowledge crowds out the reasoning.

## Starting a conversation well

Say which layer you are in. "Icon change", "picker behaviour", "server route",
"deploy problem" — each has a different file set and a different risk profile,
and naming it up front skips a round of orientation.

For anything visual, expect to look at it yourself before it ships. Claude
cannot see the rendered result, and every visual bug in this project was found
by you on a phone rather than by any check that ran beforehand.

## Keeping this current

When a change alters an invariant, adds a trap, or closes one of the known gaps,
update `CLAUDE.md` in the same commit. A stale context document is worse than
none, because it is believed.
