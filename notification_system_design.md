# Notification System Design

## Stage 1

### Goal
Design a REST API contract for campus notifications and a real-time delivery mechanism that clients can consume when users are logged in.

### Core Actions
- Publish a notification
- List notifications (latest first, with filters)
- Acknowledge (mark as read)
- Dismiss (hide without deleting)
- Get unread count
- Subscribe to real-time updates

### Auth
All endpoints are protected. Use `Authorization: Bearer <token>`.

### Data Model (JSON)
```json
{
	"id": "string",
	"type": "event|placement|result",
	"message": "string",
	"timestamp": "2026-04-22T17:51:30Z",
	"read": false,
	"severity": "info|warn|urgent",
	"link": "https://example.edu/notifications/123"
}
```

### REST Endpoints

#### 1) Create Notification
`POST /api/notifications`

Headers:
```
Authorization: Bearer <token>
Content-Type: application/json
```

Request:
```json
{
	"type": "event",
	"message": "tech talk at 5pm",
	"severity": "info",
	"link": "https://example.edu/events/tech-talk"
}
```

Response `201`:
```json
{
	"id": "b28f3218-ea5a-4b7c-93a9-1f2f240d64b0",
	"type": "event",
	"message": "tech talk at 5pm",
	"timestamp": "2026-04-22T17:51:30Z",
	"read": false,
	"severity": "info",
	"link": "https://example.edu/events/tech-talk"
}
```

#### 2) List Notifications
`GET /api/notifications`

Query params:
- `limit` (default 20, max 100)
- `cursor` (pagination token)
- `type` (event|placement|result)
- `unreadOnly` (true|false)

Headers:
```
Authorization: Bearer <token>
```

Response `200`:
```json
{
	"items": [
		{
			"id": "d146095a-0d86-4a34-9e69-3900a14576bc",
			"type": "result",
			"message": "mid-sem",
			"timestamp": "2026-04-22T17:51:30Z",
			"read": false,
			"severity": "info",
			"link": "https://example.edu/results/mid-sem"
		}
	],
	"nextCursor": "eyJvZmZzZXQiOjIwLCJ0cyI6MTcxMzgwODk5MH0="
}
```

#### 3) Get Unread Count
`GET /api/notifications/unread-count`

Headers:
```
Authorization: Bearer <token>
```

Response `200`:
```json
{ "unread": 4 }
```

#### 4) Mark Read
`POST /api/notifications/{id}/read`

Headers:
```
Authorization: Bearer <token>
```

Response `200`:
```json
{ "id": "d146095a-0d86-4a34-9e69-3900a14576bc", "read": true }
```

#### 5) Dismiss
`POST /api/notifications/{id}/dismiss`

Headers:
```
Authorization: Bearer <token>
```

Response `200`:
```json
{ "id": "d146095a-0d86-4a34-9e69-3900a14576bc", "dismissed": true }
```

### Real-Time Delivery
Use Server-Sent Events (SSE) for logged-in clients.

`GET /api/notifications/stream`

Headers:
```
Authorization: Bearer <token>
Accept: text/event-stream
```

Events:
```
event: notification
data: {"id":"d146095a-0d86-4a34-9e69-3900a14576bc","type":"result","message":"mid-sem","timestamp":"2026-04-22T17:51:30Z","read":false,"severity":"info"}
```

Client heartbeat every 30s:
```
event: ping
data: {}
```
