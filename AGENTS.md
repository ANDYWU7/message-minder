# Project save points

- After every working change, make a Git commit with a short, descriptive message.
- Follow NOTES.md: after each save point, push it to GitHub.
- When the user says "go back", restore the latest save point by discarding changes made since the latest commit. If there are no uncommitted changes, revert the most recent working-change commit to return to the previous save point, preserving history.
- Before restoring, inspect the changes. After restoring, tell the user what was undone. Do not remove ignored secrets or dependencies.
