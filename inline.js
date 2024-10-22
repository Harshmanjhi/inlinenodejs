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
app.post('/process_inline_query', async (req, res) => {
    const { query, offset, limit } = req.body;  // Accept limit
    const offsetValue = parseInt(offset) || 0;
    const limitValue = parseInt(limit) || 20;  // Use the limit or default to 20

    let characters = [];

    if (query.startsWith('collection.')) {
        const queryParts = query.split(' ');
        const userId = queryParts[0].split('.')[1];  // Extract user ID
        const searchTerms = queryParts.slice(1).join(' ');  // Extract search terms

        // Ensure the userId is a number
        if (/^\d+$/.test(userId)) {
            let user = userCollectionCache.get(userId);  // Check cache for user data
            if (!user) {
                user = await userCollection.findOne({ id: parseInt(userId) });  // Fetch from DB if not in cache
                if (user) {
                    userCollectionCache.set(userId, user);  // Cache the user data
                }
            }

            if (user) {
                // Get unique character IDs from user data
                characters = [...new Set(user.characters.map((c) => c.id))]
                    .map((id) => user.characters.find((c) => c.id === id));

                // Filter characters based on search terms
                if (searchTerms.length) {
                    const regex = new RegExp(searchTerms, 'i');
                    characters = characters.filter((c) => regex.test(c.name) || regex.test(c.anime));
                }
            }
        }
    } else {
        // General character search or load all characters if no query
        if (query) {
            const regex = new RegExp(query, 'i');
            characters = await characterCollection.find({ $or: [{ name: regex }, { anime: regex }] }).toArray();
        } else {
            characters = allCharactersCache.get('all_characters') || await characterCollection.find({}).toArray();
            allCharactersCache.set('all_characters', characters);  // Cache all characters if not already cached
        }
    }

    // Paginate the characters (limit to 20 per page)
    const paginatedCharacters = characters.slice(offsetValue, offsetValue + limitValue);
    const nextOffset = paginatedCharacters.length === limitValue ? offsetValue + limitValue : '';

    const results = await Promise.all(paginatedCharacters.map(async (character) => {
        const globalCount = await userCollection.countDocuments({ 'characters.id': character.id });  // Get global count
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
