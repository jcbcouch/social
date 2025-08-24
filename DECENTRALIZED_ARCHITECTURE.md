# Decentralized Social App Architecture

## Core Concepts

### 1. Federation Model
- **Independent Servers (Instances)**: Each server runs its own copy of your app.
- **User Accounts**: Users sign up on specific servers (like email: user@server1.com, user@server2.com)
- **Local vs Remote Content**: 
  - Local content: Created by users on that server
  - Remote content: Fetched from other servers

### 2. Data Flow
```
[User A on Server 1] --(posts)--> [Server 1]
        ↓
[Server 1 stores post locally]
        ↓
[Server 1 notifies followers, including users on Server 2]
        ↓
[Server 2 fetches post from Server 1 when needed]
```

## Key Components

### 1. User Identity
- Each user has a unique identifier: `@username@server.com`
- Public keys for verification

### 2. Data Storage
- Local database for local content
- Cache of remote content (with TTL)
- Follow relationships between users across servers

### 3. API Endpoints
- `POST /api/v1/statuses` - Create a post
- `GET /api/v1/accounts/:id/statuses` - Get user's posts
- `GET /api/v1/timelines/public` - Public timeline
- `POST /api/v1/follows` - Follow a user

### 4. Federation Protocol
- **Inbox/Outbox Model**:
  - Inbox: Receives activities from other servers
  - Outbox: Sends activities to other servers
- **WebSub/Webhooks** for real-time updates
- **Shared Inbox** for efficiency

## Data Synchronization

### 1. Pull Model
- When a user on Server 2 follows a user on Server 1:
  1. Server 2 periodically polls Server 1 for new posts
  2. Server 1 sends new posts to Server 2's inbox

### 2. Push Model
- When a user posts on Server 1:
  1. Server 1 pushes the post to all follower servers' inboxes
  2. Servers store the post in their local database

## Security Considerations
- **HTTPS** for all communications
- **Request Signing** using HTTP Signatures
- **Rate Limiting** to prevent abuse
- **Content Moderation** per server

## Implementation Steps
1. **Basic API** (what you have now)
2. **User Authentication** with API keys
3. **Federation Protocol** between servers
4. **Data Synchronization** between servers
5. **Caching Layer** for performance
6. **Admin Tools** for moderation

## Challenges to Consider
- **Data Consistency**: How to handle conflicts if the same post is modified on different servers?
- **Performance**: Fetching remote content can be slow
- **Storage**: Need to manage cached remote content
- **Discovery**: How users find content across servers

## Next Steps
1. Set up the basic server-to-server communication
2. Implement the federation protocol
3. Create the inbox/outbox system
4. Add user authentication across servers
5. Implement content synchronization
6. Add caching and performance optimizations
