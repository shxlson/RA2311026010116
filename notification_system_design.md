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

## Stage 2

### Storage Choice
Use PostgreSQL. It is reliable, supports strong consistency, flexible indexing, JSON if needed, and mature tooling for pagination and analytics. It also works well with read replicas and partitioning as volume grows.

### Schema (SQL)
```sql
CREATE TABLE users (
	user_id UUID PRIMARY KEY,
	email TEXT UNIQUE NOT NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TYPE notification_type AS ENUM ('event', 'placement', 'result');
CREATE TYPE notification_severity AS ENUM ('info', 'warn', 'urgent');

CREATE TABLE notifications (
	notification_id UUID PRIMARY KEY,
	type notification_type NOT NULL,
	message TEXT NOT NULL,
	severity notification_severity NOT NULL,
	link TEXT,
	created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE user_notifications (
	user_id UUID NOT NULL REFERENCES users(user_id),
	notification_id UUID NOT NULL REFERENCES notifications(notification_id),
	read_at TIMESTAMPTZ,
	dismissed_at TIMESTAMPTZ,
	PRIMARY KEY (user_id, notification_id)
);

CREATE INDEX idx_notifications_created_at ON notifications (created_at DESC);
CREATE INDEX idx_user_notifications_unread ON user_notifications (user_id, read_at) WHERE read_at IS NULL;
CREATE INDEX idx_user_notifications_active ON user_notifications (user_id, dismissed_at) WHERE dismissed_at IS NULL;
```

### Growth Problems and Fixes
- Hot read path for listing notifications: add composite indexes and use cursor pagination.
- Large tables: partition notifications by month on created_at; archive old partitions.
- High read volume: add read replicas and cache unread counts with short TTL.
- High write volume: batch insert user_notifications for fan-out or use async workers.
- Long history queries: move old data to cold storage and keep only recent months online.

### Queries (based on Stage 1)

Create notification (admin action):
```sql
INSERT INTO notifications (notification_id, type, message, severity, link)
VALUES ($1, $2, $3, $4, $5);
```

Fan-out to users (example for a target list):
```sql
INSERT INTO user_notifications (user_id, notification_id)
SELECT unnest($1::uuid[]), $2::uuid;
```

List notifications (cursor pagination, latest first):
```sql
SELECT n.notification_id AS id,
	n.type,
	n.message,
	n.severity,
	n.link,
	n.created_at AS timestamp,
	(un.read_at IS NOT NULL) AS read
FROM user_notifications un
JOIN notifications n ON n.notification_id = un.notification_id
WHERE un.user_id = $1
	AND un.dismissed_at IS NULL
	AND ($2::notification_type IS NULL OR n.type = $2)
	AND ($3::boolean IS NULL OR ($3 = true AND un.read_at IS NULL))
	AND (n.created_at, n.notification_id) < ($4::timestamptz, $5::uuid)
ORDER BY n.created_at DESC, n.notification_id DESC
LIMIT $6;
```

Unread count:
```sql
SELECT COUNT(*) AS unread
FROM user_notifications
WHERE user_id = $1 AND read_at IS NULL AND dismissed_at IS NULL;
```

Mark read:
```sql
UPDATE user_notifications
SET read_at = now()
WHERE user_id = $1 AND notification_id = $2;
```

Dismiss:
```sql
UPDATE user_notifications
SET dismissed_at = now()
WHERE user_id = $1 AND notification_id = $2;
```

## Stage 3

### Query Review
Given query:
```sql
SELECT * FROM notifications
WHERE studentID = 1042 AND isRead = false
ORDER BY createdAt DESC;
```

Is it accurate? Not if the schema uses a separate user mapping table. In the Stage 2 design, user state (read/dismissed) lives in `user_notifications`, not in `notifications`. So this should query `user_notifications` joined to `notifications`.

Why slow?
- It likely scans a large table and then sorts, because there is no composite index on `(studentID, isRead, createdAt)`.
- `SELECT *` pulls unnecessary columns and increases IO.

What to change:
- Move read state to `user_notifications` (or ensure it is already there).
- Add a composite index that matches the filter + order.
- Use cursor pagination to avoid deep offset scans.

Likely cost:
- Current: full scan + sort $O(N \log N)$ on 5,000,000 rows.
- With index: index scan on $(user\_id, read\_at, created\_at)$ around $O(\log N + k)$ for $k$ results.

Index on every column?
No. Too many indexes slow writes, increase storage, and can degrade planner choices. Index only what matches hot filters and ordering.

### Improved Query (aligned with Stage 2)
```sql
SELECT n.notification_id AS id,
	n.type,
	n.message,
	n.severity,
	n.created_at AS timestamp
FROM user_notifications un
JOIN notifications n ON n.notification_id = un.notification_id
WHERE un.user_id = $1
	AND un.read_at IS NULL
	AND un.dismissed_at IS NULL
ORDER BY n.created_at DESC
LIMIT $2;
```

Suggested index:
```sql
CREATE INDEX idx_unread_by_user_time
ON user_notifications (user_id, read_at, dismissed_at, notification_id);
```

And keep `notifications(created_at DESC)` from Stage 2.

### Query: Students with Placement in Last 7 Days
```sql
SELECT DISTINCT un.user_id
FROM user_notifications un
JOIN notifications n ON n.notification_id = un.notification_id
WHERE n.type = 'placement'
	AND n.created_at >= now() - interval '7 days';
```
