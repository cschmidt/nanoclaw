---
name: gws-workspace
description: Manage Gmail, Calendar, Drive, Sheets, Docs, Tasks via Google Workspace CLI (gws)
user_invocable: false
---

Use `gws` to manage Google Workspace services with minimal tool calls and minimal output.

## Rules

### Output & language
- Don't print CLI commands unless explicitly requested
- If asked for commands: print ALL executed commands in order
- Don't mix languages within one reply
- Be concise

### Tool efficiency
- Combine operations where possible to minimize round-trips
- Use JSON output (`--format json`) when you need to parse results programmatically
- Use plain text output for human-readable responses

## Services

### Gmail

#### List messages
- Inbox: `gws gmail messages list --max-results 10`
- Search: `gws gmail messages list --query "from:user@example.com" --max-results 20`
- Unread: `gws gmail messages list --query "is:unread"`
- With label: `gws gmail messages list --label-ids INBOX`

#### Read message
- `gws gmail messages get <messageId>`
- `gws gmail messages get <messageId> --format full`

#### Send email
- `gws gmail messages send --to "recipient@example.com" --subject "Subject" --body "Body text"`
- With CC: `gws gmail messages send --to "to@example.com" --cc "cc@example.com" --subject "Subject" --body "Body"`
- With attachment: `gws gmail messages send --to "to@example.com" --subject "Subject" --body "Body" --attachments "/path/to/file"`

#### Reply to email
- `gws gmail messages reply <messageId> --body "Reply text"`

#### Labels
- List: `gws gmail labels list`
- Apply: `gws gmail messages modify <messageId> --add-label-ids "LABEL_ID"`
- Remove: `gws gmail messages modify <messageId> --remove-label-ids "LABEL_ID"`

#### Drafts
- Create: `gws gmail drafts create --to "to@example.com" --subject "Subject" --body "Body"`
- List: `gws gmail drafts list`
- Send: `gws gmail drafts send <draftId>`

### Calendar

Note: For calendar operations, prefer `gcalcli` (see gcalcli-calendar skill) which has better support for interactive calendar management. Use `gws calendar` only when gcalcli is unavailable or for operations gcalcli doesn't support.

#### List events
- Today: `gws calendar events list --calendar-id primary --time-min "$(date -u +%Y-%m-%dT00:00:00Z)" --time-max "$(date -u -d tomorrow +%Y-%m-%dT00:00:00Z)"`
- Custom range: `gws calendar events list --calendar-id primary --time-min "<start>" --time-max "<end>"`

#### Create event
- `gws calendar events create --calendar-id primary --summary "Meeting" --start "2024-01-15T10:00:00" --end "2024-01-15T11:00:00"`
- With attendees: `gws calendar events create --calendar-id primary --summary "Meeting" --start "<start>" --end "<end>" --attendees "user1@example.com,user2@example.com"`

#### Delete event
- `gws calendar events delete --calendar-id primary --event-id <eventId>`

### Drive

#### List files
- Recent: `gws drive files list --max-results 10`
- Search: `gws drive files list --query "name contains 'report'"`
- In folder: `gws drive files list --query "'<folderId>' in parents"`
- By type: `gws drive files list --query "mimeType='application/vnd.google-apps.spreadsheet'"`

#### Download file
- `gws drive files download <fileId> --output "/path/to/save"`
- Export Google Doc as PDF: `gws drive files export <fileId> --mime-type "application/pdf" --output "/path/to/file.pdf"`

#### Upload file
- `gws drive files upload --file "/path/to/file" --name "filename"`
- To folder: `gws drive files upload --file "/path/to/file" --name "filename" --parents "<folderId>"`

#### Create folder
- `gws drive files create --name "Folder Name" --mime-type "application/vnd.google-apps.folder"`

#### Share file
- `gws drive permissions create <fileId> --type user --role writer --email "user@example.com"`

### Sheets

#### Read spreadsheet
- `gws sheets values get <spreadsheetId> --range "Sheet1!A1:D10"`
- Entire sheet: `gws sheets values get <spreadsheetId> --range "Sheet1"`

#### Write to spreadsheet
- `gws sheets values update <spreadsheetId> --range "Sheet1!A1" --values '[["Header1","Header2"],["val1","val2"]]'`
- Append: `gws sheets values append <spreadsheetId> --range "Sheet1!A1" --values '[["new1","new2"]]'`

#### Create spreadsheet
- `gws sheets create --title "New Spreadsheet"`

### Docs

#### Read document
- `gws docs get <documentId>`

#### Create document
- `gws docs create --title "New Document"`

#### Update document
- Insert text: `gws docs batchUpdate <documentId> --requests '[{"insertText":{"location":{"index":1},"text":"Hello World"}}]'`

### Tasks

#### List task lists
- `gws tasks tasklists list`

#### List tasks
- `gws tasks list --tasklist "<tasklistId>"`
- Default list: `gws tasks list --tasklist "@default"`

#### Create task
- `gws tasks create --tasklist "@default" --title "Task title"`
- With due date: `gws tasks create --tasklist "@default" --title "Task title" --due "2024-01-15T00:00:00Z"`
- With notes: `gws tasks create --tasklist "@default" --title "Task title" --notes "Additional details"`

#### Complete task
- `gws tasks update --tasklist "@default" --task "<taskId>" --status completed`

#### Delete task
- `gws tasks delete --tasklist "@default" --task "<taskId>"`

## Actions policy

### Reads: execute immediately
- All read/list/search operations execute without confirmation

### Creates & sends: confirm when consequential
- Email sends: confirm recipient and content before sending
- File sharing: confirm permissions before granting access
- Calendar invites with attendees: confirm before sending

### Deletes: always verify
- Confirm before deleting emails, files, or events
- Verify deletion was successful after execution

### Modifications: use judgment
- Minor updates (labels, task status): execute immediately
- Major changes (email forwarding, file moves): confirm first
