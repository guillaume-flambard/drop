# CI path filtering — documentation-only acceptance canary

Temporary PR into `feat/t4-28-ci-scope`: this document is the **only changed file** against the feature branch.

Expected GitHub-hosted proof for a pull-request event:

- Required jobs `test`, `test-windows`, `test-macos` remain **present and successful** (never Pending due to a skipped workflow).
- Each job classifies the diff as `docs-only`; lint remains required.
- Expensive Rust sidecar, full typecheck and test suites are skipped **at the step level**, never by skipping the required jobs.
- A subsequent `merge_group` run still exercises the complete matrix, independently of the PR-only shortcut.

This PR is intended solely as validation of T4.28. Do not merge the canary into the feature branch or publish it as a product change. Record actual GitHub run URLs and results before closing.
