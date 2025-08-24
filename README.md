# Federated Social Server

A federated social server that allows users to create and share posts across multiple instances.

## Features

- User authentication and authorization
- Create and view posts
- Federated timeline
- ActivityPub protocol support
- Server-to-server communication

## Prerequisites

- Node.js (v16 or later)
- PostgreSQL (v12 or later)
- npm or yarn

## Setup

1. Clone the repository
   ```bash
   git clone https://github.com/yourusername/social-server.git
   cd social-server
   ```

2. Install dependencies
   ```bash
   npm install
   ```

3. Set up environment variables
   ```bash
   cp .env.example .env
   ```
   Edit the `.env` file with your configuration.

4. Set up the database
   ```bash
   npx prisma migrate dev --name init
   ```

5. Start the server
   ```bash
   # Development
   npm run dev

   # Production
   npm start
   ```

## Configuration

Edit the `.env` file to configure your server:

```env
# Server Configuration
SERVER_DOMAIN=your-domain.com
SERVER_NAME="My Social Server"
SERVER_DESCRIPTION="A federated social server"

# Database
DATABASE_URL="postgresql://user:password@localhost:5432/social"

# JWT
JWT_SECRET=your_jwt_secret_key_here
JWT_EXPIRE=30d

# Server
PORT=3000
NODE_ENV=development

# Federation
# Comma-separated list of peer servers to connect with
PEERS=peer1.example.com,peer2.example.com
```

## API Endpoints

- `GET /` - Server information
- `GET /.well-known/nodeinfo` - NodeInfo descriptor
- `GET /nodeinfo/2.0` - NodeInfo 2.0 endpoint
- `GET /api/v1/instance` - Instance information
- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Login
- `GET /api/posts` - Get all posts
- `POST /api/posts` - Create a new post

## Federation

This server implements a basic ActivityPub federation protocol. To connect with other instances:

1. Add the domain of the peer server to your `PEERS` environment variable
2. Restart the server
3. The server will automatically attempt to establish a connection with the peer

## Federation Guide

### Following a Remote User

1. Resolve the user's actor URL using WebFinger:
   ```
   GET /.well-known/webfinger?resource=acct:username@example.com
   ```

2. Fetch the user's actor information:
   ```
   GET https://example.com/users/username
   ```

3. Send a Follow activity to the user's inbox:
   ```
   POST https://example.com/users/username/inbox
   ```
   ```json
   {
     "@context": "https://www.w3.org/ns/activitystreams",
     "id": "https://yourserver.com/activities/123",
     "type": "Follow",
     "actor": "https://yourserver.com/users/yourusername",
     "object": "https://example.com/users/username"
   }
   ```

### Posting to Followers

1. Create a Note:
   ```json
   {
     "@context": "https://www.w3.org/ns/activitystreams",
     "id": "https://yourserver.com/notes/456",
     "type": "Note",
     "content": "Hello, federated world!",
     "published": "2023-08-23T12:00:00Z",
     "attributedTo": "https://yourserver.com/users/yourusername",
     "to": ["https://www.w3.org/ns/activitystreams#Public"]
   }
   ```

2. Wrap it in a Create activity and deliver to followers' inboxes.

## Running in Production

1. Set `NODE_ENV=production` in your `.env` file
2. Use a production-ready database (PostgreSQL recommended)
3. Set up HTTPS (required for federation)
4. Use a process manager like PM2:
   ```bash
   npm install -g pm2
   pm2 start src/index.js --name "federated-social-app"
   pm2 save
   pm2 startup
   ```

## License

MIT
