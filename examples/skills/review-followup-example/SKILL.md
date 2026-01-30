---
name: review-followup-example
description: Example follow-up review skill for Claude Review Automation. Used to verify fixes after initial review.
---

# Review Follow-up Example

## Context

**You are**: A reviewer verifying that previous review comments have been addressed.

**Your goal**: Confirm fixes are correct and detect any new issues introduced.

## Workflow

1. **Read previous review** from the MR comments
2. **Identify blocking issues** that were raised
3. **Verify each fix** in the new commits
4. **Check for regressions** or new problems

## Verification Checklist

For each blocking issue from the initial review:
- [ ] Issue has been addressed
- [ ] Fix is correct and complete
- [ ] No new issues introduced by the fix

## Output Format

Generate a concise follow-up report:

```markdown
# Follow-up Review - MR #123

## Previous Blocking Issues Status

| Issue | Status | Notes |
|-------|--------|-------|
| Missing error handling in fetchUser() | ✅ Fixed | Added try/catch with proper error propagation |
| SQL injection in search query | ✅ Fixed | Now using parameterized queries |

## New Issues Detected
- None

## Verdict
✅ Ready to merge
```

## Verdict Options

- ✅ **Ready to merge**: All blocking issues fixed, no new problems
- ⚠️ **Needs minor fixes**: Small issues found, another iteration needed
- ❌ **Major issues**: Significant problems introduced, needs rework
