---
name: effect-reference
description: Reference Effect and additional reference repositories using effect in a reusable local exploration cache. Use this skill when the user asks to explore, inspect, investigate, compare, or answer questions. Use when reading or writing effect code. Use when the user has questions about effect code. Use when working with code that imports effect. 
---

Use this skill to explore effect code without cluttering the active workspace

## Repository Cache 

Use `.references/repos` as the local cache directory for repositories being explored.

## Current Cache Contents

```!
mkdir -p .references/repos
ls -la .references/repos
```

## Workflow

1. List the current repository cache to make sure that effect is already cloned locally
  - In hosts that support skill shell injection, use the "Current Cache Contents" section above
2. Check whether effect, opencode, and t3code reference repos are already present in `.references/repos`
  - `https://github.com/effect-TS/effect-smol`: effect v4 beta code
  - `https://github.com/pingdotgg/t3code`: t3code effect reference application
  - `https://github.com/anomalyco/opencode`: opencode effect reference application
3. If the repositories are not present, clone them into .references/repos`, then explore there.
  - Create `.references/repos` First if it does not exist.
  - Clone with a clear destination path, for example:
  ```
  mkdir -p .references/repos
  git clone <repo-url> .references/repos/<repo-name>
  ```
4. Check to make sure we have the current tag being used checked out

After opening the repository, inspect its local instructions and project metadata before making assumptions. Prefer targeted file reads for exploration.
