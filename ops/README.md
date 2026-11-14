# GitHub releases and production deployment

Edit locally, commit/push, let GitHub build/test, then explicitly deploy the
chosen commit. A Git push never activates production by itself. Each repository
has its own workflow and backend/frontend images. PostgreSQL, mail and shared
media live outside those images.

## Local development

Keep using the existing development servers and virtual environments. After
pulling these frontend dependency updates, refresh the Node installation in
each project's `frontend` folder with `npm ci`; AveStudio uses
`npm ci --legacy-peer-deps` for its existing React/Three peer requirements.
Restart the local frontend dev server afterward.

For a new JavaScript dependency, commit both `package.json` and
`package-lock.json`. Production Python dependencies come from
`ops/requirements.lock`, which contains hashes for Linux/Python 3.12 wheels.
A Python dependency change needs that lock updated and tested in Linux;
installing a package in a Windows virtual environment alone does not change
the production image. Keep dependency upgrades as a reviewed change.

## One-time setup on the development PC

Install GitHub CLI from PowerShell:

```powershell
winget install --id GitHub.cli --exact --source winget
```

Open a new PowerShell terminal so `gh` is on PATH. Sign in as
`alexupetrescu` in the browser window:

```powershell
gh auth login --hostname github.com --git-protocol https --web --scopes workflow
gh auth setup-git
gh auth status
gh api user --jq .login
```

The CLI needs `workflow` to push workflow files. CI publishes with its
temporary `GITHUB_TOKEN`; the VPS gets a separate read-only package token.
Stripe, Drive, mailbox passwords and VPS SSH/sudo credentials are not GitHub
Actions secrets and are not build inputs.

Frontend static generation reads the sites' already-public HTTPS APIs, as a
browser would, so built pages contain published content. It uses no login,
private album PIN, payment key or Drive credential. If a public API required
for static generation is down, the build can fail while the current release
keeps running. Application and frontend integration tests use disposable data
and an isolated database instead of the production database.

## Publish the prepared setup

Run in each local project directory. For example:

```powershell
Set-Location D:\Web\avestudio
python .\ops\publish_setup.py
```

Repeat from `D:\Web\aveletter` and `D:\Web\lunador`. This helper verifies the
reviewed file hashes, commits only the setup inventory, pushes the separate
`ops/github-releases-20261114` branch and opens a pull request. It does not
stage unrelated work, reset files, publish the backup directory, or deploy.
The setup commit is on local `main`; the remote PR branch points to that same
commit. The merge-commit step below preserves a simple fast-forward afterward.

Watch each PR's tests from its project folder:

```powershell
gh pr checks ops/github-releases-20261114 --watch
gh pr view ops/github-releases-20261114 --web
```

After the checks pass and you review the PR, merge using **Create a merge
commit**, equivalent to this command. Use this merge method for the initial
setup so the local setup commit remains in the remote history:

```powershell
gh pr merge ops/github-releases-20261114 --merge --delete-branch
git pull --ff-only origin main
```

Repeat in all three folders. The merge into `main` triggers a new **Release
images** run, which publishes the images after all tests pass. Watch it:

```powershell
gh run list --workflow release.yml --branch main --limit 5
gh run watch
```

Select the new run for the commit you intend to release. A PR run builds and
tests but does not publish images. If GitHub asks to enable Actions, enable
the repository's Actions workflows. No automatic production deployment is
configured.

## Configure VPS registry access once, for all three projects

Create a **personal access token (classic)** with **`read:packages` only**:

https://github.com/settings/tokens/new?scopes=read:packages&description=avestudio-vps-pull

Choose an expiry you can track. Copy the token privately; do not put it in a
command, `.env`, Git, chat or a screenshot. The next command opens SSH and
prompts in that terminal for your VPS sudo password, then for this token:

```powershell
Set-Location D:\Web\avestudio
python .\ops\deploy.py setup
```

This installs the shared root-owned deployment helper and saves Docker's
registry login in root's private configuration. It does not activate a release
or restart the sites. It is needed once per VPS, not once per project.

The GHCR packages are named `<project>-production-backend` and
`<project>-production-frontend` under `alexupetrescu`. Before application
builds, the workflow publishes a tiny marker image containing no source or
credentials and verifies private visibility and rejected anonymous access.
It repeats the access checks after publishing the application images.
Keep these packages private. The original public `<project>-backend`
packages are unused; deployment rejects their image references.

When the registry token expires or is revoked, generate its replacement and
run `python .\ops\deploy.py setup --login` from any one project folder.

## First production release

Start with one site. In that project's folder, synchronize main and select
the exact commit whose **main-branch** release build succeeded:

```powershell
git pull --ff-only origin main
$releaseCommit = git rev-parse HEAD
python .\ops\deploy.py plan --commit $releaseCommit
```

The plan downloads the digest-pinned images, checks their source/revision,
validates the existing production adapter and runs Django checks/migration
planning. Existing production containers keep running. It does not migrate
the database or enable another worker.

For a release with no pending schema migrations:

```powershell
python .\ops\deploy.py deploy --commit $releaseCommit
```

The initial Aveletter setup includes two explicit migrations for previously
unrecorded help-text changes and an index name. Review that plan, then use:

```powershell
Set-Location D:\Web\aveletter
$releaseCommit = git rev-parse HEAD
python .\ops\deploy.py plan --commit $releaseCommit
python .\ops\deploy.py deploy --commit $releaseCommit --migrate
```

`--migrate` explicitly permits the reviewed migration plan. The helper requires
a successful off-host production backup from the last 26 hours, takes an
additional immediate database dump, puts that site's hostnames in maintenance,
stops its writers, migrates with the new image and starts/health-checks the new
runtime. Aveletter's one email worker is updated with its backend. Other sites
remain running. Active AveStudio photo jobs block a backend replacement until
they finish.

If the off-host backup is too old, keep the Windows receiver running, start
a fresh transfer and wait for its successful status before deploying:

```powershell
ssh -t -F .\ops\ssh.conf avestudio-production "sudo systemctl start --no-block avestudio-production-backup.service"
```

From `D:\Web\avestudio`, inspect it with:

```powershell
python .\infrastructure\migration-2026-11-09\backup-bridge.py --status
```

The adapter files in `ops/production_*.py` record the host-mounted production
configuration. CI tests them, and backend activation checks their hashes against
the installed version. A change to those files requires a reviewed configuration
release; editing a copy inside an image does not replace the host mount.

## Everyday updates

Work normally in the appropriate folder. For example, for an Aveletter UI edit:

```powershell
Set-Location D:\Web\aveletter
git status
git diff
git add -- frontend/app/layout.tsx
git commit -m "Describe the change"
git push origin main
gh run list --workflow release.yml --branch main --limit 5
gh run watch
$releaseCommit = git rev-parse HEAD
python .\ops\deploy.py plan --commit $releaseCommit
python .\ops\deploy.py deploy --commit $releaseCommit
```

Replace the example `git add` path with the files you actually changed.
Uncommitted local edits are not part of a GitHub release. Use pull requests
instead of direct main pushes whenever you want a separate review before the
release build. Both routes still require an explicit deployment command.

For a frontend-only release, avoid restarting the backend:

```powershell
python .\ops\deploy.py plan --commit $releaseCommit --service frontend
python .\ops\deploy.py deploy --commit $releaseCommit --service frontend
```

Backend-only releases use `--service backend`. Normally deploy both together
when their API contract changes. Never run multiple deployment commands in
parallel; the VPS helper serializes its releases with a global lock.

## Health failure and rollback

For code-only failures during activation, the helper restores the prior image
references/configuration and retains the current database/media. To undo the
most recent successful code-only release later:

```powershell
python .\ops\deploy.py rollback
```

Once a schema migration begins, the helper deliberately leaves a failed release
in maintenance for repair; it does not restore an older database or assume the
old image supports the changed schema. The displayed root-only log identifies
the release. Preserve the database, media and mail, and inspect the failure.

Do not run migration-era staging installers for an ordinary release. Do not
use `docker compose down -v`, broad image pruning, or source snapshot restoration
as deployment steps. Previous images and per-release dumps are retained for
recovery; cleanup is a separate reviewed operation.

To inspect a failed GitHub build:

```powershell
gh run list --workflow release.yml --limit 5
gh run view RUN_ID --log-failed
```

Replace `RUN_ID` with the numeric ID shown by `gh run list`.

Official references: [publishing Docker images](https://docs.github.com/en/actions/tutorials/publish-packages/publish-docker-images),
[private registry authentication](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry),
[running workflows](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow).
