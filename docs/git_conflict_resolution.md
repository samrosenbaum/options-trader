# Resolving Git Merge Conflicts

When GitHub displays a message such as:

```
This branch has conflicts that must be resolved
Use the web editor or the command line to resolve conflicts before continuing.

Conflicting files
tests/scoring/test_engine.py
```

follow these steps to resolve the conflict locally and push the fix.

## 1. Update your local branch

```bash
git fetch origin
git checkout <your-branch>
git pull --ff-only
```

If `git pull --ff-only` fails because history diverged, run `git pull` (without
`--ff-only`) to bring in the conflicting changes from the target branch.

## 2. Inspect the conflicting file(s)

Open each file listed under “Conflicting files” and search for the conflict
markers that Git inserts:

```text
<<<<<<< HEAD
...your branch's content...
=======
...incoming content from the target branch...
>>>>>>> origin/main
```

Manually decide which lines to keep, edit, or combine. Remove every conflict
marker (`<<<<<<<`, `=======`, `>>>>>>>`) once you finish editing.

## 3. Test the resolution

After you have edited all conflicts, run the test suite to confirm nothing broke:

```bash
pytest -q
```

Only proceed when the tests pass (or when failures match the target branch's
state).

## 4. Mark conflicts as resolved and commit

```bash
git add tests/scoring/test_engine.py
# Stage additional files if you touched more than one

git status  # verify nothing else is conflicted

git commit -m "Resolve merge conflict in test_engine"
```

## 5. Push the updated branch

```bash
git push origin <your-branch>
```

GitHub should now show the branch as mergeable. If new conflicts appear, repeat
these steps. For large or complicated conflicts, consider using a merge tool
(e.g. `git mergetool`, VS Code, or PyCharm) to visualize the differences.
