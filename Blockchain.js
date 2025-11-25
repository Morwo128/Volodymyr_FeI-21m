// PORT=3001 PEERS=http://localhost:3002 OWNER_TOKEN=12345 node Blockchain.js
// PORT=3002 PEERS=http://localhost:3001 WALLET_OWNER_TOKEN=12345 node Blockchain.js

const express = require('express');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001;
const PEERS = process.env.PEERS ? process.env.PEERS.split(',').map(p => p.trim()).filter(Boolean) : [];
const OWNER_TOKEN = process.env.OWNER_TOKEN || process.env.WALLET_OWNER_TOKEN || null;

function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

// ECDSA keypair (secp256k1)
function generateKeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
    namedCurve: 'secp256k1',
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });
  return { publicKey, privateKey };
}

// AES-GCM encrypt / decrypt
function aesGcmEncrypt(plaintext, key) {
  // key: Buffer(32) for AES-256-GCM
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
  };
}

function aesGcmDecrypt(obj, key) {
  const iv = Buffer.from(obj.iv, 'base64');
  const tag = Buffer.from(obj.tag, 'base64');
  const ciphertext = Buffer.from(obj.ciphertext, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}

function signData(privateKeyPem, data) {
  const sign = crypto.createSign('SHA256');
  sign.update(data);
  sign.end();
  return sign.sign(privateKeyPem, 'base64');
}

function verifySignature(publicKeyPem, data, signatureBase64) {
  const verify = crypto.createVerify('SHA256');
  verify.update(data);
  verify.end();
  return verify.verify(publicKeyPem, signatureBase64, 'base64');
}

//
// ---- Block and Blockchain
//
class Block {
  constructor(index, timestamp, prevHash, encryptedPayload, authorPublicKeyPem, signature, nonce=0) {
    this.index = index;
    this.timestamp = timestamp;
    this.prevHash = prevHash;
    this.encryptedPayload = encryptedPayload; // {ciphertext, iv, tag}
    this.authorPublicKeyPem = authorPublicKeyPem;
    this.signature = signature; // base64
    this.nonce = nonce; // optional (if use PoW)
    this.hash = this.computeHash();
  }

  computeHash() {
    // hash should include everything except the hash itself
    const data = JSON.stringify({
      index: this.index,
      timestamp: this.timestamp,
      prevHash: this.prevHash,
      encryptedPayload: this.encryptedPayload,
      authorPublicKeyPem: this.authorPublicKeyPem,
      signature: this.signature,
      nonce: this.nonce
    });
    return sha256(data);
  }

  isValid(previousBlock) {
    if (previousBlock && this.index !== previousBlock.index + 1) return false;
    if (previousBlock && this.prevHash !== previousBlock.hash) return false;
    if (this.hash !== this.computeHash()) return false;
    // verify signature: signature should be on the block content (we'll recreate the signed content)
    const signedContent = sha256(JSON.stringify({
      index: this.index,
      timestamp: this.timestamp,
      prevHash: this.prevHash,
      encryptedPayload: this.encryptedPayload,
      nonce: this.nonce
    }));
    if (!verifySignature(this.authorPublicKeyPem, signedContent, this.signature)) return false;
    return true;
  }
}

class Blockchain {
  constructor() {
    this.chain = [this.createGenesisBlock()];
  }

  createGenesisBlock() {
    const index = 0;
    const timestamp = new Date().toISOString();
    const prevHash = "0";
    const encryptedPayload = { ciphertext: "", iv: "", tag: "" };
    const kp = generateKeyPair(); // genesis keypair local
    const signedContent = sha256(JSON.stringify({ index, timestamp, prevHash, encryptedPayload, nonce:0 }));
    const signature = signData(kp.privateKey, signedContent);
    const block = new Block(index, timestamp, prevHash, encryptedPayload, kp.publicKey, signature, 0);
    return block;
  }

  getLatestBlock() {
    return this.chain[this.chain.length - 1];
  }

  addBlock(newBlock) {
    if (newBlock.isValid(this.getLatestBlock())) {
      this.chain.push(newBlock);
      return true;
    }
    return false;
  }

  isValidChain(chain) {
    if (!Array.isArray(chain) || chain.length === 0) return false;
    // Validate genesis by comparing shape (we do not require same key)
    for (let i = 1; i < chain.length; i++) {
      const block = chain[i];
      const prev = chain[i-1];
      const bObj = Object.assign(new Block(), block);
      const pObj = Object.assign(new Block(), prev);
      // rehydrate methods
      if (!bObj.isValid(pObj)) return false;
    }
    return true;
  }

  replaceChain(newChain) {
    if (newChain.length <= this.chain.length) return false;
    if (!this.isValidChain(newChain)) return false;
    this.chain = newChain.map(b => Object.assign(new Block(), b));
    return true;
  }
}

//
// ---- Node / API
//
const app = express();
app.use(bodyParser.json({limit: '1mb'}));
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

const blockchain = new Blockchain();
// Node's own keypair (author)
const nodeKeys = generateKeyPair();
// Symmetric key store for devices (in practice — secure KMS or device-specific keys)
const symKeys = {}; // map deviceId -> Buffer(32)
// Simple in-memory wallet store: walletId -> { publicKey, privateKey }
const wallets = {};

function isOwnerRequest(req) {
  if (!OWNER_TOKEN) return false;
  const authHeader = req.headers.authorization || '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const tokenFromBody = req.body && req.body.ownerToken;
  return bearer === OWNER_TOKEN || tokenFromBody === OWNER_TOKEN;
}

// Helper: create symmetric key for device
function ensureDeviceKey(deviceId) {
  if (!symKeys[deviceId]) {
    symKeys[deviceId] = crypto.randomBytes(32); // AES-256 key
  }
  return symKeys[deviceId];
}

// Endpoint: get chain
app.get('/chain', (req, res) => {
  res.json({ chain: blockchain.chain, length: blockchain.chain.length });
});

// Endpoint: get node info (public key)
app.get('/node/info', (req, res) => {
  res.json({ publicKey: nodeKeys.publicKey, peers: PEERS, port: PORT });
});

// Endpoint: create block (payload plain text) — will encrypt for given deviceId using device key
app.post('/blocks/create', async (req, res) => {
  try {
    const { deviceId, payload, authorPrivateKeyPem, authorPublicKeyPem, authorWalletId } = req.body;
    if (!deviceId || !payload) return res.status(400).json({ error: 'deviceId and payload required' });

    // determine symmetric key for device (or expect client to provide)
    const symKey = ensureDeviceKey(deviceId);

    // encrypt payload
    const encryptedPayload = aesGcmEncrypt(typeof payload === 'string' ? payload : JSON.stringify(payload), symKey);

    // build block content to sign (we sign hashed content to be clear & compact)
    const index = blockchain.getLatestBlock().index + 1;
    const timestamp = new Date().toISOString();
    const prevHash = blockchain.getLatestBlock().hash;

    const signedContent = sha256(JSON.stringify({ index, timestamp, prevHash, encryptedPayload, nonce:0 }));

    // Determine signing identity
    let signingPrivateKey = null;
    let signingPublicKey = null;

    if (authorWalletId) {
      const wallet = wallets[authorWalletId];
      if (!wallet) return res.status(404).json({ error: 'wallet not found', walletId: authorWalletId });
      signingPrivateKey = wallet.privateKey;
      signingPublicKey = wallet.publicKey;
    } else if (authorPrivateKeyPem) {
      if (!authorPublicKeyPem) {
        return res.status(400).json({ error: 'authorPublicKeyPem required when supplying authorPrivateKeyPem' });
      }
      signingPrivateKey = authorPrivateKeyPem;
      signingPublicKey = authorPublicKeyPem;
    } else {
      return res.status(400).json({ error: 'authorWalletId or authorPrivateKeyPem required' });
    }

    const signature = signData(signingPrivateKey, signedContent);

    const newBlock = new Block(index, timestamp, prevHash, encryptedPayload, signingPublicKey, signature, 0);

    if (blockchain.addBlock(newBlock)) {
      // broadcast to peers
      broadcastBlock(newBlock);
      return res.json({ success: true, block: newBlock });
    } else {
      return res.status(400).json({ success: false, error: 'Invalid block' });
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
});

// Endpoint: receive block from peer (for sync)
app.post('/blocks/receive', (req, res) => {
  const { block } = req.body;
  if (!block) return res.status(400).json({ error: 'no block' });
  const bObj = Object.assign(new Block(), block);
  const prev = blockchain.getLatestBlock();
  if (bObj.isValid(prev)) {
    blockchain.chain.push(bObj);
    return res.json({ success: true });
  } else {
    // maybe their chain is longer: request full chain
    return res.status(400).json({ success: false, error: 'invalid block' });
  }
});

// Endpoint: POST /chain/replace - peers can send their full chain
app.post('/chain/replace', (req, res) => {
  const { chain: newChain } = req.body;
  if (!newChain) return res.status(400).json({ error: 'no chain' });
  if (blockchain.replaceChain(newChain)) {
    return res.json({ success: true });
  } else {
    return res.status(400).json({ success: false, error: 'did not replace' });
  }
});

// Utility: broadcast block to peers
async function broadcastBlock(block) {
  for (const peer of PEERS) {
    try {
      await fetch(`${peer.replace(/\/$/,'')}/blocks/receive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ block })
      });
    } catch (e) {
      console.warn(`Failed to broadcast to ${peer}: ${e.message}`);
    }
  }
}

// Utility: ask peers for chains and adopt longest valid
async function syncWithPeers() {
  for (const peer of PEERS) {
    try {
      const resp = await fetch(`${peer.replace(/\/$/,'')}/chain`);
      if (!resp.ok) continue;
      const json = await resp.json();
      const theirChain = json.chain;
      if (theirChain && theirChain.length > blockchain.chain.length && blockchain.isValidChain(theirChain)) {
        blockchain.replaceChain(theirChain);
        console.log('Replaced chain with peer', peer);
      }
    } catch (e) {
      // ignore
    }
  }
}

// Endpoint: decrypt a block payload (must provide deviceId and node must have key)
app.post('/blocks/decrypt', (req, res) => {
  const { index, deviceId } = req.body;
  if (index == null || !deviceId) return res.status(400).json({ error: 'index and deviceId required' });
  const block = blockchain.chain.find(b => b.index === Number(index));
  if (!block) return res.status(404).json({ error: 'block not found' });
  const key = symKeys[deviceId];
  if (!key) return res.status(404).json({ error: 'no key for deviceId on this node' });
  try {
    const plaintext = aesGcmDecrypt(block.encryptedPayload, key);
    return res.json({ plaintext });
  } catch (e) {
    return res.status(400).json({ error: 'decrypt failed', detail: e.message });
  }
});

// Endpoint: get latest block for device (by attempting decryption backwards)
app.get('/blocks/latest-for-device', (req, res) => {
  const deviceId = req.query.deviceId;
  const includePlaintext = String(req.query.includePlaintext || '').toLowerCase() === 'true';
  if (!deviceId) return res.status(400).json({ error: 'deviceId required' });

  const key = symKeys[deviceId];
  if (!key) return res.status(404).json({ error: 'no key for deviceId on this node' });

  for (let i = blockchain.chain.length - 1; i >= 1; i--) { // skip genesis at index 0
    const block = blockchain.chain[i];
    const payload = block && block.encryptedPayload;
    if (!payload || !payload.ciphertext || !payload.iv || !payload.tag) continue;
    try {
      const plaintext = aesGcmDecrypt(payload, key);
      if (includePlaintext) {
        return res.json({ block, plaintext });
      }
      return res.json({ block });
    } catch (e) {
      // decryption failed -> not for this device, continue
    }
  }

  return res.status(404).json({ error: 'no blocks found for deviceId' });
});

// Endpoint: get all blocks / transactions
// Optional query params:
// - deviceId: when provided with includePlaintext=true will attempt to decrypt each block payload for this device
// - includePlaintext: 'true' to include decrypted plaintext when possible
app.get('/blocks/all', (req, res) => {
  const deviceId = req.query.deviceId;
  const includePlaintext = String(req.query.includePlaintext || '').toLowerCase() === 'true';

  const results = blockchain.chain.slice(1).map(block => { // skip genesis
    if (includePlaintext && deviceId) {
      const key = symKeys[deviceId];
      if (!key) {
        return { block, error: 'no_key_for_device' };
      }
      try {
        const plaintext = aesGcmDecrypt(block.encryptedPayload, key);
        return { block, plaintext };
      } catch (e) {
        return { block, error: 'decrypt_failed', detail: e.message };
      }
    }
    // default: return block with encrypted payload only
    return { block };
  });

  res.json({ blocks: results, length: results.length });
});

// Endpoint: create a wallet (generates new ECDSA keypair stored in-memory)
app.post('/wallets/create', (req, res) => {
  if (!OWNER_TOKEN) {
    return res.status(500).json({ error: 'wallet creation disabled: OWNER_TOKEN not set on node' });
  }
  if (!isOwnerRequest(req)) {
    return res.status(403).json({ error: 'owner token required' });
  }

  const { walletId, label } = req.body || {};
  const id = walletId || `wallet-${crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36)}`;
  if (wallets[id]) return res.status(400).json({ error: 'wallet already exists', walletId: id });

  const kp = generateKeyPair();
  wallets[id] = { ...kp, label: label || null, createdAt: new Date().toISOString() };

  res.json({
    walletId: id,
    publicKey: kp.publicKey,
    privateKey: kp.privateKey,
    label: wallets[id].label,
  });
});

// Start server
app.listen(PORT, async () => {
  console.log(`Node running on port ${PORT}`);
  console.log(`Public key:\n${nodeKeys.publicKey}`);
  console.log('Peers:', PEERS);
  // try sync once on start
  await syncWithPeers();
});
