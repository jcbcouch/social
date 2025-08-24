const { PrismaClient } = require('@prisma/client');
const { v4: uuidv4 } = require('uuid');
const { createSignature } = require('../middleware/httpSignature');
const axios = require('axios');

const prisma = new PrismaClient();

/**
 * Creates a new ActivityPub activity
 * @param {string} type - The type of activity (Create, Follow, Like, etc.)
 * @param {string} actor - The actor performing the activity
 * @param {Object} object - The object of the activity
 * @param {string} [to] - The target of the activity (defaults to public)
 * @returns {Object} The created activity
 */
const createActivity = (type, actor, object, to = 'https://www.w3.org/ns/activitystreams#Public') => {
  const activity = {
    '@context': 'https://www.w3.org/ns/activitystreams',
    id: `${process.env.SERVER_DOMAIN}/activities/${uuidv4()}`,
    type,
    actor,
    object,
    to: Array.isArray(to) ? to : [to],
    published: new Date().toISOString(),
  };

  return activity;
};

/**
 * Creates a new Note object
 * @param {string} content - The content of the note
 * @param {string} author - The author's actor URL
 * @param {Object} [options] - Additional options
 * @param {string} [options.inReplyTo] - URL of the post being replied to
 * @param {boolean} [options.sensitive] - Whether the note contains sensitive content
 * @param {string} [options.summary] - Content warning or summary
 * @returns {Object} The created note
 */
const createNote = (content, author, options = {}) => {
  const note = {
    type: 'Note',
    id: `${process.env.SERVER_DOMAIN}/notes/${uuidv4()}`,
    content,
    published: new Date().toISOString(),
    attributedTo: author,
    to: ['https://www.w3.org/ns/activitystreams#Public'],
    cc: [`${author}/followers`],
    sensitive: options.sensitive || false,
  };

  if (options.inReplyTo) note.inReplyTo = options.inReplyTo;
  if (options.summary) note.summary = options.summary;

  return note;
};

/**
 * Delivers an activity to a remote inbox
 * @param {Object} activity - The activity to deliver
 * @param {string} inbox - The target inbox URL
 * @param {string} [keyId] - The actor's key ID (for signing)
 * @param {string} [privateKey] - The actor's private key (for signing)
 * @returns {Promise<Object>} The delivery result
 */
const deliverToInbox = async (activity, inbox, keyId, privateKey) => {
  try {
    const headers = {
      'Content-Type': 'application/activity+json',
      'Accept': 'application/activity+json, application/ld+json',
      'Date': new Date().toUTCString(),
      'User-Agent': `${process.env.SERVER_NAME} (${process.env.SERVER_DOMAIN})`,
    };

    // Sign the request if keyId and privateKey are provided
    if (keyId && privateKey) {
      const { headers: signatureHeaders } = await createSignature(privateKey, keyId, {
        url: inbox,
        method: 'POST',
        headers,
        body: activity,
      });
      Object.assign(headers, signatureHeaders);
    }

    const response = await axios.post(inbox, activity, {
      headers,
      maxRedirects: 3,
      validateStatus: (status) => status >= 200 && status < 300 || status === 401,
    });

    return {
      success: true,
      status: response.status,
      statusText: response.statusText,
      data: response.data,
    };
  } catch (error) {
    console.error('Delivery failed:', error.message);
    return {
      success: false,
      error: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
    };
  }
};

/**
 * Fetches a remote actor's profile
 * @param {string} actorUrl - The actor's URL
 * @returns {Promise<Object>} The actor's profile
 */
const fetchActor = async (actorUrl) => {
  try {
    const response = await axios.get(actorUrl, {
      headers: {
        'Accept': 'application/activity+json, application/ld+json',
      },
    });

    return response.data;
  } catch (error) {
    console.error('Failed to fetch actor:', error.message);
    throw error;
  }
};

/**
 * Resolves a WebFinger identifier to an actor URL
 * @param {string} identifier - The identifier (user@domain)
 * @returns {Promise<string>} The actor URL
 */
const resolveWebFinger = async (identifier) => {
  try {
    const [user, domain] = identifier.split('@');
    const webfingerUrl = `https://${domain}/.well-known/webfinger?resource=acct:${user}@${domain}`;
    
    const response = await axios.get(webfingerUrl, {
      headers: {
        'Accept': 'application/jrd+json, application/json',
      },
    });

    const link = response.data.links.find(
      link => link.rel === 'self' && link.type === 'application/activity+json'
    );

    if (!link) {
      throw new Error('No ActivityPub actor link found');
    }

    return link.href;
  } catch (error) {
    console.error('WebFinger resolution failed:', error.message);
    throw error;
  }
};

module.exports = {
  createActivity,
  createNote,
  deliverToInbox,
  fetchActor,
  resolveWebFinger,
};
