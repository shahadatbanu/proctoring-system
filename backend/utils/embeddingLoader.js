/**
 * utils/embeddingLoader.js
 *
 * Called once at server startup.
 * Reads all stored face embeddings from MongoDB → pushes them
 * into the Python AI service so it can verify faces immediately
 * without waiting for a /register-face call.
 */

const axios = require('axios');
const { User } = require('../models');

const AI_SERVICE = process.env.AI_SERVICE_URL || 'http://localhost:8000';

async function preloadEmbeddings() {
  try {
    const users = await User.find({
      faceRegistered: true,
      faceEmbedding:  { $ne: null, $exists: true },
    }).select('_id faceEmbedding');

    if (!users.length) {
      console.log('ℹ️  No stored embeddings to preload');
      return;
    }

    let loaded = 0;
    for (const user of users) {
      try {
        await axios.post(`${AI_SERVICE}/load-embedding`, {
          user_id:   user._id.toString(),
          embedding: user.faceEmbedding,
        }, { timeout: 5000 });
        loaded++;
      } catch (err) {
        console.warn(`⚠️  Could not preload embedding for user ${user._id}: ${err.message}`);
      }
    }
    console.log(`✅  Preloaded ${loaded}/${users.length} face embeddings into AI service`);
  } catch (err) {
    console.error('❌  Embedding preload failed:', err.message);
  }
}

module.exports = { preloadEmbeddings };
