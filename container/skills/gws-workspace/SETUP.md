# gws-workspace Setup

One-time authentication is required before agents can use the Google Workspace CLI.

## Prerequisites

1. Create a Google Cloud project with the following APIs enabled:
   - Gmail API
   - Google Calendar API
   - Google Drive API
   - Google Sheets API
   - Google Docs API
   - Google Tasks API
2. Create OAuth 2.0 credentials (Desktop application type)
3. Download the client secret JSON file

## Authentication

Run `gws` once on the host to complete the OAuth flow:

```bash
gws auth login --client-id YOUR_CLIENT_ID --client-secret YOUR_CLIENT_SECRET
```

This opens a browser for Google sign-in and saves credentials to `~/.gws-credentials.json`.

## Container Mount

The `~/.gws-credentials.json` file is automatically mounted into agent containers at `/home/node/.gws-credentials.json` (read-only), so agents can access Google Workspace services without re-authenticating.

The environment variable `GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE` is set in the container image to point to this file.

No further configuration is needed after the initial auth.

## Scopes

The default OAuth scopes requested cover all supported services. To restrict access, specify scopes during auth:

```bash
gws auth login --client-id YOUR_CLIENT_ID --client-secret YOUR_CLIENT_SECRET --scopes "gmail.readonly,drive.readonly"
```

## Verify

Test that the integration works:

```bash
gws gmail messages list --max-results 1
gws drive files list --max-results 1
gws tasks tasklists list
```
