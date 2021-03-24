# GitHub Auto Merge Webhook Handler
**Automatically merge dependabot PRs across your organization**

At Sierra Softworks, we've got hundreds of repositories, many of which use [Dependabot]
to keep their dependencies updated. On your average day, we see anywhere from 5-20 automated
PRs arrive and that can take a lot of time to manage.

Previously, we've used GitHub Actions to automate the process of merging these dependabot PRs,
however that requires each repository to be individually configured with the necessary GitHub
Action script - not really scalable.

To solve the problem, we've built this Azure Function which can be added as an organization-level
webhook handler and which will automatically (for trusted accounts) enable GitHub's built-in
auto merge behaviour, or fall-back on using `@dependabot merge` for repos which don't have that
enabled.

## Configuration
When deploying this function, you will need to provide the following configuration options:

 - `TRUSTED_ACCOUNTS` (default: `dependabot[bot],dependabot-preview[bot]`)
 
   This is the comma separated list of user accounts you trust to automatically merge PRs
   (once checks pass etc).

 - `GITHUB_ACCESS_TOKEN` (**required**)

   This is a GitHub Personal Access Token which has the `repo` scope for your organization.

 - `WEBHOOK_SECRET` (**required**)

   This is a secret string which will be used by GitHub to sign all webhook payloads as a means
   of securely verifying that they were sent by GitHub. Use a secure random generator to create this.

[Dependabot]: https://github.blog/2020-06-01-keep-all-your-packages-up-to-date-with-dependabot/