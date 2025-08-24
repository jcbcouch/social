const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

const prisma = new PrismaClient();

// Generate RSA key pair for the user
const generateKeyPair = () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem'
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem',
      cipher: 'aes-256-cbc',
      passphrase: process.env.JWT_SECRET
    }
  });

  return { publicKey, privateKey };
};

// @route   POST /api/auth/register
// @desc    Register a new user
// @access  Public
router.post(
  '/register',
  [
    body('name', 'Name is required').not().isEmpty(),
    body('username', 'Username is required').not().isEmpty(),
    body('username', 'Username can only contain letters, numbers, and underscores')
      .matches(/^[a-zA-Z0-9_]+$/),
    body('email', 'Please include a valid email').isEmail(),
    body('password', 'Please enter a password with 6 or more characters').isLength({ min: 6 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, username, email, password, bio } = req.body;
    const domain = process.env.SERVER_DOMAIN || 'localhost';
    const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
    const actorUrl = `${protocol}://${domain}/users/${username}`;
    
    try {
      // Check if user exists with email or username
      const existingUser = await prisma.user.findFirst({
        where: {
          OR: [
            { email },
            { username },
            { actorUrl }
          ]
        }
      });

      if (existingUser) {
        return res.status(400).json({ 
          errors: [{ 
            msg: existingUser.email === email 
              ? 'Email already in use' 
              : 'Username already taken' 
          }] 
        });
      }

      // Generate keys for the user
      const { publicKey, privateKey } = generateKeyPair();
      
      // Create user URLs
      const userUrls = {
        inbox: `${actorUrl}/inbox`,
        outbox: `${actorUrl}/outbox`,
        followers: `${actorUrl}/followers`,
        following: `${actorUrl}/following`,
        featured: `${actorUrl}/collections/featured`
      };

      // Hash password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      // Create user
      const user = await prisma.user.create({
        data: {
          name,
          username,
          email,
          password: hashedPassword,
          bio: bio || null,
          domain,
          actorUrl,
          publicKey,
          privateKey,
          inboxUrl: userUrls.inbox,
          outboxUrl: userUrls.outbox,
          followersUrl: userUrls.followers,
          followingUrl: userUrls.following,
          featuredUrl: userUrls.featured,
          sharedInboxUrl: `${protocol}://${domain}/inbox`
        },
        select: {
          id: true,
          name: true,
          email: true,
          username: true,
          actorUrl: true,
          createdAt: true
        }
      });

      // Return JWT
      const payload = {
        user: {
          id: user.id,
          actorUrl: user.actorUrl
        }
      };

      jwt.sign(
        payload,
        process.env.JWT_SECRET,
        { expiresIn: '7d' },
        (err, token) => {
          if (err) throw err;
          res.json({ token, user });
        }
      );
    } catch (err) {
      console.error(err.message);
      res.status(500).send('Server error');
    }
  }
);

// @route   POST /api/auth/login
// @desc    Authenticate user & get token
// @access  Public
router.post(
  '/login',
  [
    body('email', 'Please include a valid email').isEmail(),
    body('password', 'Password is required').exists(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    try {
      // Check if user exists
      const user = await prisma.user.findUnique({
        where: { email },
      });

      if (!user) {
        return res.status(400).json({ errors: [{ msg: 'Invalid credentials' }] });
      }

      // Check password
      const isMatch = await bcrypt.compare(password, user.password);

      if (!isMatch) {
        return res.status(400).json({ errors: [{ msg: 'Invalid credentials' }] });
      }

      // Return jsonwebtoken
      const payload = {
        user: {
          id: user.id,
        },
      };

      jwt.sign(
        payload,
        process.env.JWT_SECRET,
        { expiresIn: '5d' },
        (err, token) => {
          if (err) throw err;
          res.json({ token });
        }
      );
    } catch (err) {
      console.error(err.message);
      res.status(500).send('Server error');
    }
  }
);

// @route   GET /api/auth/me
// @desc    Get current user
// @access  Private
router.get('/me', require('../middleware/auth').protect, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        username: true,
        actorUrl: true,
        createdAt: true
      },
    });

    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }

    res.json(user);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router;
