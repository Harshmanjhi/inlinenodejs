const express = require('express');
const { MongoClient } = require('mongodb');
const NodeCache = require('node-cache');

const app = express();
app.use(express.json());

const MONGO_URI = 'mongodb+srv://your_username:your_password@your_cluster.mongodb.net/your_database?retryWrites=true&w=majority';
const DB_NAME = 'your_database_name';
let db, userCollection, characterCollection;

// Cache setup
const allCharactersCache = new NodeCache({ stdTTL: 36000, checkperiod: 600 });
const userCollectionCache = new NodeCache({ stdTTL: 60, checkperiod: 10 });

// Connect to MongoDB
MongoClient.connect(MONGO_URI, { useUnifiedTopology: true })
  .then((client) => {
    db = client.db(DB_NAME);
    userCollection = db.collection('user_collection');
    characterCollection = db.collection('characters');
    console.log('Connected to MongoDB');

    // Create indexes
    characterCollection.createIndex({ id: 1 });
    characterCollection.createIndex({ anime: 1 });
    characterCollection.createIndex({ img_url: 1 });
    userCollection.createIndex({ 'characters.id': 1 });
    userCollection.createIndex({ 'characters.name': 1 });
    userCollection.createIndex({ 'characters.img_url': 1 });
  })
  .catch((err) => console.error('Error connecting to MongoDB:', err));

app.post('/process_inline_query', async (req, res) => {
  const { query, offset } = req.body;
  const offsetValue = parseInt(offset) || 0;

  let characters = [];

  if (query.startsWith('collection.')) {
    const [, userId, ...searchTerms] = query.split(' ');
    const searchQuery = searchTerms.join(' ');

    if (/^\d+$/.test(userId)) {
      let user = userCollectionCache.get(userId);
      if (!user) {
        user = await userCollection.findOne({ id: parseInt(userId) });
        if (user) {
          userCollectionCache.set(userId, user);
        }
      }

      if (user) {
        characters = [...new Set(user.characters.map(c => c.id))]
          .map(id => user.characters.find(c => c.id === id));

        if (searchQuery) {
          const regex = new RegExp(searchQuery, 'i');
          characters = characters.filter(c => regex.test(c.name) || regex.test(c.anime));
        }
      }
    }
  } else {
    if (query) {
      const regex = new RegExp(query, 'i');
      characters = await characterCollection.find({ $or: [{ name: regex }, { anime: regex }] }).toArray();
    } else {
      characters = allCharactersCache.get('all_characters') || await characterCollection.find({}).toArray();
      allCharactersCache.set('all_characters', characters);
    }
  }

  const paginatedCharacters = characters.slice(offsetValue, offsetValue + 10);
  const nextOffset = paginatedCharacters.length === 10 ? offsetValue + 10 : '';

  const results = await Promise.all(paginatedCharacters.map(async (character) => {
    const globalCount = await userCollection.countDocuments({ 'characters.id': character.id });
    const animeCharacters = await characterCollection.countDocuments({ anime: character.anime });

    let caption;
    if (query.startsWith('collection.')) {
      const user = userCollectionCache.get(userId);
      const userCharacterCount = user.characters.filter(c => c.id === character.id).length;
      const userAnimeCharacters = user.characters.filter(c => c.anime === character.anime).length;
      caption = `
        <b>🌟 Look At <a href='tg://user?id=${user.id}'>${escapeHtml(user.first_name || user.id)}</a>'s Character 🌟</b>\n\n
        🌸: <b>${character.name} (x${userCharacterCount})</b>\n
        🏖️: <b>${character.anime} (${userAnimeCharacters}/${animeCharacters})</b>\n
        <b>${character.rarity}</b>\n\n
        <b>🆔️:</b> ${character.id}
      `;
    } else {
      caption = `
        <b>🌈 Look At This Character!! 🌈</b>\n\n
        🌸: <b>${character.name}</b>\n
        🏖️: <b>${character.anime}</b>\n
        <b>${character.rarity}</b>\n
        🆔️: <b>${character.id}</b>\n\n
        <b>🔍 Globally Guessed: ${globalCount} Times...</b>
      `;
    }

    return {
      type: 'photo',
      id: `${character.id}_${Date.now()}`,
      photo_url: character.img_url,
      thumb_url: character.img_url,
      caption: caption,
      parse_mode: 'HTML',
    };
  }));

  res.json({ results, next_offset: nextOffset });
});

function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

app.listen(3000, () => {
  console.log('Server running on port 3000');
});
