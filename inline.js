const express = require('express');
const { MongoClient } = require('mongodb');
const NodeCache = require('node-cache');

const app = express();
app.use(express.json());

const MONGO_URI = 'mongodb+srv://harshmanjhi1801:webapp@cluster0.xxwc4.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
const DB_NAME = 'gaming_create';
let db, userCollection, characterCollection;

// Cache setup: cache for all characters and user collection data
const allCharactersCache = new NodeCache({ stdTTL: 36000, checkperiod: 600 });  
const userCollectionCache = new NodeCache({ stdTTL: 60, checkperiod: 10 });    

// Connect to MongoDB
MongoClient.connect(MONGO_URI, { useUnifiedTopology: true })
  .then((client) => {
    db = client.db(DB_NAME);
    userCollection = db.collection('gaming_totals');
    characterCollection = db.collection('gaming_anime_characters');
    console.log('Connected to MongoDB');
  })
  .catch((err) => console.error('Error connecting to MongoDB:', err));

// Inline query handler API
// Inline query handler API
app.post('/process_inline_query', async (req, res) => {
    const { query, offset, limit } = req.body;  // Accept limit
    const offsetValue = parseInt(offset) || 0;
    const limitValue = parseInt(limit) || 20;  // Use the limit or default to 20

    let characters = [];

    if (query.startsWith('collection.')) {
        // Collection-based query logic remains the same
    } else {
        // General character search or load all characters if no query
        if (query) {
            const regex = new RegExp(query, 'i');
            characters = await characterCollection.find({ $or: [{ name: regex }, { anime: regex }] }).toArray();
        } else {
            characters = allCharactersCache.get('all_characters') || await characterCollection.find({}).toArray();
            allCharactersCache.set('all_characters', characters);  // Cache if not cached
        }
    }

    // Paginate the characters
    const paginatedCharacters = characters.slice(offsetValue, offsetValue + limitValue);
    const nextOffset = paginatedCharacters.length === limitValue ? offsetValue + limitValue : '';

    const results = await Promise.all(paginatedCharacters.map(async (character) => {
        const globalCount = await userCollection.countDocuments({ 'characters.id': character.id });  // Global count
        const caption = `
            <b>🌸 ${character.name}</b>\n
            <b>🏖️ ${character.anime}</b>\n
            <b>🆔️: ${character.id}</b>\n\n
            <b>🔍 Globally Guessed: ${globalCount} Times...</b>
        `;

        return {
            type: 'photo',
            id: `${character.id}_${Date.now()}`,
            photo_url: character.img_url,
            thumb_url: character.img_url,
            caption: caption,
            parse_mode: 'HTML',
        };
    }));

    // Return the results and next offset for pagination
    res.json({ results, next_offset: nextOffset });
});

// Start the server
app.listen(3000, () => {
  console.log('Server running on port 3000');
});
