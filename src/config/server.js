const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Ensure config directory exists
const configDir = path.join(__dirname, '..', 'config');
if (!fs.existsSync(configDir)) {
  fs.mkdirSync(configDir, { recursive: true });
}

const keyPath = path.join(configDir, 'server-keys.json');

let serverKeys;

// Load or generate server keys
if (fs.existsSync(keyPath)) {
  serverKeys = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
} else {
  // Generate new keys
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem'
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem'
    }
  });

  serverKeys = {
    publicKey,
    privateKey,
    keyId: `acct:server@${process.env.SERVER_DOMAIN || 'localhost'}`, // Format: acct:server@domain.com
    algorithm: 'RS256'
  };

  fs.writeFileSync(keyPath, JSON.stringify(serverKeys, null, 2));
}

// Server configuration
const config = {
  domain: process.env.SERVER_DOMAIN || 'localhost',
  name: process.env.SERVER_NAME || 'Social Server',
  description: process.env.SERVER_DESCRIPTION || 'A federated social server',
  version: '1.0.0',
  software: 'social-server',
  protocols: ['activitypub'],
  services: {
    inbox: '/inbox',
    outbox: '/outbox',
    sharedInbox: '/inbox',
  },
  peers: process.env.PEERS ? process.env.PEERS.split(',') : [],
  ...serverKeys
};

// Helper to get server's actor object (for ActivityPub)
config.getServerActor = () => ({
  '@context': [
    'https://www.w3.org/ns/activitystreams',
    'https://w3id.org/security/v1',
  ],
  id: `https://${config.domain}/actor`,
  type: 'Application',
  preferredUsername: 'server',
  name: config.name,
  summary: config.description,
  inbox: `https://${config.domain}/inbox`,
  outbox: `https://${config.domain}/outbox`,
  publicKey: {
    id: `https://${config.domain}/actor#main-key`,
    owner: `https://${config.domain}/actor`,
    publicKeyPem: serverKeys.publicKey,
  },
});

module.exports = config;
