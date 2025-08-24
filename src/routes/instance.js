const express = require('express');
const router = express.Router();
const config = require('../config/server');

// @route   GET /.well-known/nodeinfo
// @desc    NodeInfo descriptor
// @access  Public
router.get('/.well-known/nodeinfo', (req, res) => {
  res.json({
    links: [
      {
        rel: 'http://nodeinfo.diaspora.software/ns/schema/2.0',
        href: `https://${config.domain}/nodeinfo/2.0`
      }
    ]
  });
});

// @route   GET /nodeinfo/2.0
// @desc    NodeInfo 2.0 endpoint
// @access  Public
router.get('/nodeinfo/2.0', (req, res) => {
  res.json({
    version: '2.0',
    software: {
      name: config.software,
      version: config.version,
    },
    protocols: config.protocols,
    services: {
      inbound: [],
      outbound: []
    },
    openRegistrations: true,
    usage: {
      users: {},
      localPosts: 0,
    },
    metadata: {
      nodeName: config.name,
      nodeDescription: config.description,
    }
  });
});

// @route   GET /api/v1/instance
// @desc    Get instance information
// @access  Public
router.get('/api/v1/instance', (req, res) => {
  res.json({
    uri: config.domain,
    title: config.name,
    description: config.description,
    version: config.version,
    email: `admin@${config.domain}`,
    urls: {
      streaming_api: `wss://${config.domain}`
    },
    stats: {
      user_count: 0,
      status_count: 0,
      domain_count: 0
    },
    thumbnail: `https://${config.domain}/logo.png`,
    contact_account: config.getServerActor()
  });
});

module.exports = router;
