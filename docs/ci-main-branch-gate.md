# Activating the main branch CI gate

The `CI` workflow now runs automatically for pushes and pull requests targeting
`main`. It cannot yet block merges: this private repository's current GitHub
plan rejects branch protection.

Before enabling the gate, make the repository public or use a GitHub plan that
supports branch protection or rulesets for private repositories.

After the prerequisite is met:

1. Open **Settings** → **Branches** and add or edit the `main` branch
   protection rule.
2. Enable **Require a pull request before merging**.
3. Enable **Require status checks to pass before merging**, then select exactly
   `CI / quality` and `CI / e2e`.
4. Include administrators if maintainers should also be gated.

Each CI check must complete successfully at least once before GitHub offers it
for selection. These check names intentionally remain stable: the workflow is
named `CI`, and `.github/workflows/ci.yml` defines the `quality` and `e2e` job
IDs.
