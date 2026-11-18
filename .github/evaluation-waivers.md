# Evaluation waivers (maintainers)

When platform evaluations cannot exercise a submission, review the limitation
and actual alternative evidence before applying `allow-evaluation-waiver`.
There is no submission metadata flag. Repository label-management permissions
control approval, as with the other maintainer approval labels.

The PR body must contain exactly one section in this form, with both fields
nonempty and on single lines:

```markdown
## Evaluation waiver
Reason: File attachments required by this sample are not supported in platform evaluations.
Alternative evidence: Link to the actual demo run and submitted output checks.
```

Replace the example evidence with real links or repository paths and describe
what was checked. Do not describe manual evidence as a scored evaluation export.
The label approves the exception for all changed standalone agents in that PR;
review each one. The reason and evidence stay visible in the PR body.

CI skips only evaluation CSV presence when both the label and section are
present. The trusted base-revision contribution policy also validates the
waiver section, so PR code cannot authorize its own exception. Label removal
and PR-body edits rerun the checks. Remove the label when the approved scope
or evidence no longer applies, including after relevant source changes.
Packaging, content review, fresh-environment testing, and other CI checks
remain required.

Changes to this mechanism take effect in the trusted policy only after merging
to the default branch; review the bootstrap PR directly.
