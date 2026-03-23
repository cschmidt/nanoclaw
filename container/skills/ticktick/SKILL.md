# TickTick Task Management

Manage tasks and projects via the TickTick Open API.

## Authentication

Credentials are at `/home/node/.ticktick-credentials.json` and contain:
- `client_id`, `client_secret` — OAuth app credentials
- `access_token` — bearer token for API calls (may be expired)
- `refresh_token` — used to get a new access_token

### Token Refresh

The access token expires. Before making API calls, check if the token works. If you get a 401, refresh it:

```bash
CREDS_FILE="/home/node/.ticktick-credentials.json"
CLIENT_ID=$(jq -r .client_id "$CREDS_FILE")
CLIENT_SECRET=$(jq -r .client_secret "$CREDS_FILE")
REFRESH_TOKEN=$(jq -r .refresh_token "$CREDS_FILE")

RESPONSE=$(curl -s -X POST "https://ticktick.com/oauth/token" \
  -u "${CLIENT_ID}:${CLIENT_SECRET}" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=refresh_token&refresh_token=${REFRESH_TOKEN}")

NEW_ACCESS_TOKEN=$(echo "$RESPONSE" | jq -r .access_token)

# Write updated token back to credentials file
jq --arg token "$NEW_ACCESS_TOKEN" '.access_token = $token' "$CREDS_FILE" > /tmp/ticktick_creds.json \
  && mv /tmp/ticktick_creds.json "$CREDS_FILE"
```

**Always write the updated access_token back to the credentials file after refreshing.**

## API Reference

**Base URL:** `https://ticktick.com/open/v1`

All requests require: `Authorization: Bearer {access_token}`

### Helper Setup

```bash
CREDS_FILE="/home/node/.ticktick-credentials.json"
ACCESS_TOKEN=$(jq -r .access_token "$CREDS_FILE")
BASE="https://ticktick.com/open/v1"
AUTH="Authorization: Bearer $ACCESS_TOKEN"
```

### List All Projects

```bash
curl -s -H "$AUTH" "$BASE/project" | jq .
```

Returns an array of projects with `id`, `name`, `color`, etc.

### Get Project with Tasks

```bash
PROJECT_ID="your_project_id"
curl -s -H "$AUTH" "$BASE/project/$PROJECT_ID/data" | jq .
```

Returns the project object with a `tasks` array containing all tasks in that project.

### Create a Task

```bash
curl -s -X POST "$BASE/task" \
  -H "$AUTH" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Buy groceries",
    "projectId": "PROJECT_ID",
    "content": "Milk, eggs, bread",
    "dueDate": "2026-03-25T09:00:00+0000",
    "priority": 3
  }' | jq .
```

Fields:
- `title` (required) — task title
- `projectId` — which project to add to (omit for inbox)
- `content` — task description/notes
- `dueDate` — ISO 8601 datetime
- `priority` — 0 (none), 1 (low), 3 (medium), 5 (high)

### Update a Task

```bash
TASK_ID="your_task_id"
curl -s -X POST "$BASE/task/$TASK_ID" \
  -H "$AUTH" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Buy groceries (updated)",
    "priority": 5
  }' | jq .
```

Send only the fields you want to change.

### Complete a Task

```bash
PROJECT_ID="your_project_id"
TASK_ID="your_task_id"
curl -s -X POST "$BASE/project/$PROJECT_ID/task/$TASK_ID/complete" \
  -H "$AUTH" | jq .
```

### Delete a Task

```bash
PROJECT_ID="your_project_id"
TASK_ID="your_task_id"
curl -s -X DELETE "$BASE/project/$PROJECT_ID/task/$TASK_ID" \
  -H "$AUTH" | jq .
```

## Tips

- To find a task's `projectId` and `taskId`, list projects first, then get project data.
- The inbox has a special project ID — find it in the project list (usually named "Inbox").
- Due dates should include timezone offset (e.g., `+0000` for UTC, `-0700` for Pacific).
- When creating tasks from user requests, infer reasonable defaults for priority and due date.
