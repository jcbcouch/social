require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { PrismaClient } = require('@prisma/client');
const { errorHandler } = require('./middleware/error');
const authRoutes = require('./routes/auth');
const postRoutes = require('./routes/posts');
const instanceRoutes = require('./routes/instance');
const federationRoutes = require('./routes/federation');

const prisma = new PrismaClient();
const app = express();

// Middleware
app.use(express.json());
app.use(helmet());
app.use(morgan('dev'));

// CORS configuration
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? process.env.ALLOWED_ORIGINS?.split(',') || []
    : '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Signature'],
  exposedHeaders: ['Content-Length', 'X-Request-Id'],
  credentials: true,
  maxAge: 86400 // 24 hours
}));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/instance', instanceRoutes);

// Federation routes (ActivityPub)
app.use('/', federationRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use(errorHandler);

// Test route
app.get('/', (req, res) => {
  res.json({ 
    message: 'Welcome to the Social API',
    instance: process.env.SERVER_NAME || 'Social Server',
    version: '1.0.0',
    documentation: `https://${process.env.SERVER_DOMAIN || 'localhost'}/api-docs`
  });
});

const PORT = process.env.PORT || 3000;

const startServer = async () => {
  try {
    // Test database connection
    await prisma.$connect();
    console.log('Database connected');
    
    // Start server
    const server = app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Server domain: ${process.env.SERVER_DOMAIN}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });

    // Handle shutdown gracefully
    const shutdown = async () => {
      console.log('Shutting down server...');
      server.close(async () => {
        await prisma.$disconnect();
        console.log('Server stopped');
        process.exit(0);
      });
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
    
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
  // Consider whether to exit the process in production
  // process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  // Consider whether to exit the process in production
  // process.exit(1);
});

startServer();

module.exports = app;
