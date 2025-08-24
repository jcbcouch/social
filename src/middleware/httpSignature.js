const crypto = require('crypto');
const { promisify } = require('util');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Parse the signature header into an object
const parseSignatureHeader = (header) => {
  if (!header) return null;
  
  const signature = {};
  // Remove 'Signature ' prefix if present
  const headerValue = header.startsWith('Signature ') ? header.substring(10) : header;
  
  // Parse key=value pairs
  headerValue.split(',').forEach(pair => {
    const [key, value] = pair.split('=');
    if (key && value) {
      // Remove quotes from the value
      signature[key.trim()] = value.trim().replace(/^"/, '').replace(/"$/, '');
    }
  });
  
  return signature;
};

// Verify the HTTP signature
const verifySignature = async (req, options = {}) => {
  try {
    const signature = parseSignatureHeader(req.get('signature'));
    if (!signature) {
      throw new Error('No signature header');
    }

    // Required signature parameters
    const requiredParams = ['keyId', 'algorithm', 'headers', 'signature'];
    for (const param of requiredParams) {
      if (!signature[param]) {
        throw new Error(`Missing required signature parameter: ${param}`);
      }
    }

    // Get the public key from the keyId
    const keyId = signature.keyId;
    const actor = await prisma.user.findFirst({
      where: { actorUrl: keyId },
      select: { publicKey: true }
    });

    if (!actor || !actor.publicKey) {
      throw new Error(`Actor not found or has no public key: ${keyId}`);
    }

    // Reconstruct the signing string
    const headersToSign = signature.headers.split(' ');
    const signingString = headersToSign.map(header => {
      if (header === '(request-target)') {
        return `(request-target): ${req.method.toLowerCase()} ${req.path}`;
      }
      const value = req.get(header.toLowerCase());
      if (!value) {
        throw new Error(`Missing required header in signature: ${header}`);
      }
      return `${header.toLowerCase()}: ${value}`;
    }).join('\n');

    // Verify the signature
    const verify = promisify(crypto.verify);
    const isValid = await verify(
      'sha256',
      Buffer.from(signingString),
      {
        key: actor.publicKey,
        padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
      },
      Buffer.from(signature.signature, 'base64')
    );

    if (!isValid) {
      throw new Error('Invalid signature');
    }

    // Signature is valid
    return {
      verified: true,
      keyId: signature.keyId,
      algorithm: signature.algorithm,
      headers: signature.headers
    };
  } catch (error) {
    console.error('Signature verification failed:', error.message);
    return {
      verified: false,
      error: error.message
    };
  }
};

// Middleware to verify HTTP signatures
const httpSignature = (options = {}) => {
  return async (req, res, next) => {
    // Skip signature verification for local development if enabled
    if (process.env.NODE_ENV === 'development' && process.env.SKIP_SIGNATURE_VERIFICATION === 'true') {
      return next();
    }

    const result = await verifySignature(req, options);
    
    if (!result.verified) {
      return res.status(401).json({
        error: 'Invalid signature',
        details: result.error
      });
    }

    // Store verification result in request for later use
    req.signature = result;
    next();
  };
};

// Helper to create signatures for outgoing requests
const createSignature = async (privateKey, keyId, options = {}) => {
  const {
    method = 'POST',
    url,
    headers = {},
    body = ''
  } = options;

  // Generate date header if not provided
  if (!headers.date) {
    headers.date = new Date().toUTCString();
  }

  // Add digest for POST/PUT requests with body
  if (['POST', 'PUT'].includes(method.toUpperCase()) && body) {
    const hash = crypto.createHash('sha256').update(JSON.stringify(body)).digest('base64');
    headers['digest'] = `SHA-256=${hash}`;
  }

  // Headers to sign (order is important)
  const headersToSign = ['(request-target)', 'host', 'date'];
  if (headers.digest) {
    headersToSign.push('digest');
  }

  // Generate signing string
  const signingString = headersToSign.map(header => {
    if (header === '(request-target)') {
      const path = new URL(url).pathname + (new URL(url).search || '');
      return `(request-target): ${method.toLowerCase()} ${path}`;
    }
    return `${header}: ${headers[header]}`;
  }).join('\n');

  // Sign the string
  const sign = promisify(crypto.sign);
  const signature = await sign(
    'sha256',
    Buffer.from(signingString),
    {
      key: privateKey,
      padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
    }
  );

  // Create the signature header
  const signatureHeader = `keyId="${keyId}",algorithm="rsa-sha256",headers="${headersToSign.join(' ')}",signature="${signature.toString('base64')}"`;
  
  return {
    signature: signatureHeader,
    headers: {
      ...headers,
      'signature': signatureHeader,
      'content-type': 'application/activity+json',
      'accept': 'application/activity+json'
    }
  };
};

module.exports = {
  httpSignature,
  createSignature,
  verifySignature
};
