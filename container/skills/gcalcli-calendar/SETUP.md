# gcalcli-calendar Setup

One-time OAuth authentication is required before agents can use gcalcli.

## Prerequisites

1. Create a Google Cloud project with the Calendar API enabled
2. Create OAuth 2.0 credentials (Desktop application type)
3. Download the client secret JSON file

## Authentication

Run gcalcli once on the host to complete the OAuth flow:

```bash
gcalcli --client-id YOUR_CLIENT_ID list
```

This opens a browser for Google sign-in and saves the OAuth token to `~/.gcalcli_oauth`.

## Container Mount

The `~/.gcalcli_oauth` file is automatically mounted into agent containers at `/home/node/.gcalcli_oauth` (read-only), so agents can access Google Calendar without re-authenticating.

No further configuration is needed after the initial auth.
