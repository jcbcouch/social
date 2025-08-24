const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const { httpSignature } = require('../middleware/httpSignature');
const { createSignature } = require('../middleware/httpSignature');
const axios = require('axios');

const prisma = new PrismaClient();

// Get the server's actor (for shared inbox)
const getServerActor = async () => {
  return {
    '@context': 'https://www.w3.org/ns/activitystreams',
    id: `${process.env.SERVER_DOMAIN}/actor`,
    type: 'Application',
    name: process.env.SERVER_NAME,
    preferredUsername: process.env.SERVER_NAME?.toLowerCase().replace(/\s+/g, ''),
    inbox: `${process.env.SERVER_DOMAIN}/inbox`,
    outbox: `${process.env.SERVER_DOMAIN}/outbox`,
    publicKey: {
      id: `${process.env.SERVER_DOMAIN}/actor#main-key`,
      owner: `${process.env.SERVER_DOMAIN}/actor`,
      publicKeyPem: (await prisma.server.findFirst()).publicKey
    }
  };
};

// Get user's webfinger resource
router.get('/.well-known/webfinger', async (req, res) => {
  const { resource } = req.query;
  
  if (!resource || !resource.startsWith('acct:')) {
    return res.status(400).json({ error: 'Bad request. Expected acct:user@domain' });
  }

  const [username, domain] = resource.replace('acct:', '').split('@');
  
  if (domain !== new URL(process.env.SERVER_DOMAIN).hostname) {
    return res.status(404).json({ error: 'User not found' });
  }

  const user = await prisma.user.findFirst({
    where: { username },
    select: { id: true, username: true, name: true }
  });

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  res.json({
    subject: `acct:${username}@${domain}`,
    links: [
      {
        rel: 'self',
        type: 'application/activity+json',
        href: `${process.env.SERVER_DOMAIN}/users/${user.id}`
      }
    ]
  });
});

// Get user's actor information
router.get('/users/:id', async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    select: {
      id: true,
      username: true,
      name: true,
      bio: true,
      publicKey: true,
      actorUrl: true,
      inboxUrl: true,
      outboxUrl: true,
      followersUrl: true,
      followingUrl: true
    }
  });

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  res.json({
    '@context': [
      'https://www.w3.org/ns/activitystreams',
      'https://w3id.org/security/v1'
    ],
    id: user.actorUrl,
    type: 'Person',
    preferredUsername: user.username,
    name: user.name,
    summary: user.bio || '',
    inbox: user.inboxUrl,
    outbox: user.outboxUrl,
    followers: user.followersUrl,
    following: user.followingUrl,
    publicKey: {
      id: `${user.actorUrl}#main-key`,
      owner: user.actorUrl,
      publicKeyPem: user.publicKey
    }
  });
});

// Shared inbox for all incoming activities
router.post('/inbox', httpSignature(), async (req, res) => {
  const activity = req.body;
  
  try {
    // Handle different activity types
    switch (activity.type) {
      case 'Follow':
        await handleFollow(activity);
        break;
      case 'Create':
        await handleCreate(activity);
        break;
      case 'Undo':
        await handleUndo(activity);
        break;
      case 'Accept':
        await handleAccept(activity);
        break;
      case 'Reject':
        await handleReject(activity);
        break;
      default:
        console.log('Unhandled activity type:', activity.type);
    }
    
    res.status(202).end();
  } catch (error) {
    console.error('Error processing activity:', error);
    res.status(500).json({ error: 'Failed to process activity' });
  }
});

// User-specific inbox
router.post('/users/:username/inbox', httpSignature(), async (req, res) => {
  // Similar to shared inbox but scoped to a specific user
  // Implementation would be similar to shared inbox but with user-specific logic
  res.status(202).end();
});

// Outbox for a user
router.get('/users/:username/outbox', async (req, res) => {
  const { username } = req.params;
  const page = parseInt(req.query.page) || 1;
  const limit = 20;
  const offset = (page - 1) * limit;
  
  const user = await prisma.user.findUnique({
    where: { username },
    select: { id: true }
  });
  
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  const activities = await prisma.activity.findMany({
    where: { actorId: user.id },
    orderBy: { createdAt: 'desc' },
    skip: offset,
    take: limit,
    include: { object: true }
  });
  
  res.json({
    '@context': 'https://www.w3.org/ns/activitystreams',
    id: `${process.env.SERVER_DOMAIN}/users/${username}/outbox`,
    type: 'OrderedCollection',
    totalItems: await prisma.activity.count({ where: { actorId: user.id } }),
    orderedItems: activities.map(formatActivity)
  });
});

// Helper functions for handling different activity types
async function handleFollow(activity) {
  const { actor, object } = activity;
  
  // Store the follow request
  await prisma.follow.create({
    data: {
      followerId: actor,
      followingId: object,
      status: 'PENDING',
      actor: JSON.stringify(actor),
      object: JSON.stringify(object)
    }
  });
  
  // Auto-accept follows for now (in a real app, you might want manual approval)
  const acceptActivity = {
    '@context': 'https://www.w3.org/ns/activitystreams',
    id: `${process.env.SERVER_DOMAIN}/activities/${crypto.randomUUID()}`,
    type: 'Accept',
    actor: object,
    object: activity
  };
  
  await sendActivity(acceptActivity, actor);
}

async function handleCreate(activity) {
  const { object } = activity;
  
  if (object.type === 'Note') {
    await prisma.post.create({
      data: {
        id: object.id,
        content: object.content,
        userId: activity.actor.split('/').pop(), // Extract user ID from actor URL
        uri: object.id,
        url: object.url || object.id,
        isPublic: object.to.includes('https://www.w3.org/ns/activitystreams#Public'),
        contentWarning: object.summary || null,
        inReplyTo: object.inReplyTo || null,
        sensitive: object.sensitive || false
      }
    });
  }
}

async function handleUndo(activity) {
  const { object } = activity;
  
  if (object.type === 'Follow') {
    await prisma.follow.deleteMany({
      where: {
        followerId: object.actor,
        followingId: object.object
      }
    });
  }
}

async function handleAccept(activity) {
  const { object } = activity;
  
  if (object.type === 'Follow') {
    await prisma.follow.updateMany({
      where: {
        followerId: object.actor,
        followingId: object.object
      },
      data: {
        status: 'ACCEPTED'
      }
    });
  }
}

async function handleReject(activity) {
  const { object } = activity;
  
  if (object.type === 'Follow') {
    await prisma.follow.deleteMany({
      where: {
        followerId: object.actor,
        followingId: object.object
      }
    });
  }
}

// Helper to format activities for the outbox
function formatActivity(activity) {
  const base = {
    id: activity.id,
    type: activity.type,
    actor: activity.actor,
    published: activity.createdAt.toISOString(),
    to: ['https://www.w3.org/ns/activitystreams#Public']
  };
  
  if (activity.object) {
    base.object = {
      ...activity.object,
      id: activity.object.uri || activity.object.id,
      url: activity.object.url || activity.object.id,
      published: activity.object.createdAt ? new Date(activity.object.createdAt).toISOString() : new Date().toISOString()
    };
  }
  
  return base;
}

// Helper to send activities to other servers
async function sendActivity(activity, to) {
  try {
    const inbox = to.endsWith('/inbox') ? to : `${to}/inbox`;
    const { headers } = await createSignature(
      process.env.SERVER_PRIVATE_KEY,
      `${process.env.SERVER_DOMAIN}/actor`,
      {
        url: inbox,
        body: activity
      }
    );
    
    await axios.post(inbox, activity, { headers });
  } catch (error) {
    console.error('Failed to send activity:', error.message);
    throw error;
  }
}

module.exports = router;
