# TickTick Integration — One-Time Setup

Run this on the **host machine** (not inside a container).

## 1. Register a TickTick App

1. Go to https://developer.ticktick.com and sign in
2. Create a new app
3. Set the redirect URI to `http://localhost:8080/callback`
4. Note your **Client ID** and **Client Secret**

## 2. Create Credentials File

Write your client credentials to `~/.ticktick-credentials.json`:

```json
{
  "client_id": "YOUR_CLIENT_ID",
  "client_secret": "YOUR_CLIENT_SECRET"
}
```

## 3. Run the OAuth Flow

Save and run this Python script to complete the OAuth dance:

```python
#!/usr/bin/env python3
"""TickTick OAuth2 setup — exchanges client credentials for access + refresh tokens."""

import json
import os
import sys
import webbrowser
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs, urlencode
from pathlib import Path

import urllib.request

CREDS_PATH = Path.home() / ".ticktick-credentials.json"
REDIRECT_URI = "http://localhost:8080/callback"

def load_creds():
    if not CREDS_PATH.exists():
        print(f"Error: {CREDS_PATH} not found. Create it with client_id and client_secret.")
        sys.exit(1)
    with open(CREDS_PATH) as f:
        creds = json.load(f)
    if "client_id" not in creds or "client_secret" not in creds:
        print("Error: credentials file must contain client_id and client_secret")
        sys.exit(1)
    return creds

def exchange_code(code, creds):
    """Exchange authorization code for access and refresh tokens."""
    data = urlencode({
        "code": code,
        "grant_type": "authorization_code",
        "redirect_uri": REDIRECT_URI,
    }).encode()

    # TickTick uses HTTP Basic auth (client_id:client_secret) for token exchange
    import base64
    auth = base64.b64encode(f"{creds['client_id']}:{creds['client_secret']}".encode()).decode()

    req = urllib.request.Request(
        "https://ticktick.com/oauth/token",
        data=data,
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "Authorization": f"Basic {auth}",
        },
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())

def main():
    creds = load_creds()
    captured = {}

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            qs = parse_qs(urlparse(self.path).query)
            if "code" in qs:
                captured["code"] = qs["code"][0]
                self.send_response(200)
                self.send_header("Content-Type", "text/html")
                self.end_headers()
                self.wfile.write(b"<h1>Success!</h1><p>You can close this tab.</p>")
            else:
                self.send_response(400)
                self.end_headers()
                self.wfile.write(b"Missing code parameter")

        def log_message(self, format, *args):
            pass  # suppress request logs

    # Open browser to TickTick OAuth authorization page
    params = urlencode({
        "scope": "tasks:read tasks:write",
        "client_id": creds["client_id"],
        "redirect_uri": REDIRECT_URI,
        "response_type": "code",
    })
    auth_url = f"https://ticktick.com/oauth/authorize?{params}"
    print(f"Opening browser to:\n{auth_url}\n")
    webbrowser.open(auth_url)

    # Wait for the callback
    print("Waiting for OAuth callback on http://localhost:8080 ...")
    server = HTTPServer(("127.0.0.1", 8080), Handler)
    server.handle_request()

    if "code" not in captured:
        print("Error: did not receive authorization code")
        sys.exit(1)

    print("Got authorization code, exchanging for tokens...")
    tokens = exchange_code(captured["code"], creds)

    # Write all four fields back to the credentials file
    result = {
        "client_id": creds["client_id"],
        "client_secret": creds["client_secret"],
        "access_token": tokens["access_token"],
        "refresh_token": tokens.get("refresh_token", ""),
    }
    with open(CREDS_PATH, "w") as f:
        json.dump(result, f, indent=2)
    print(f"Tokens saved to {CREDS_PATH}")

if __name__ == "__main__":
    main()
```

Run it:

```bash
python3 ticktick_setup.py
```

After completion, `~/.ticktick-credentials.json` will contain all four fields and will be mounted into agent containers automatically.
