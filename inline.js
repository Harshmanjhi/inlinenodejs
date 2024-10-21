const express = require('express');
const { MongoClient } = require('mongodb');
const NodeCache = require('node-cache');

const app = express();
app.use(express.json());

const MONGO_URI = 'mongodb+srv://harshmanjhi1801:webapp@cluster0.xxwc4.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
const DB_NAME = 'gaming_create';
let db, userCollection, characterCollection;

const allCharactersCache = new NodeCache({ stdTTL: 36000, checkperiod: 600 });
const userCollectionCache = new NodeCache({ stdTTL: 60, checkperiod: 10 });

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
    const { query, offset } = req.body;
    let characters = [];
    const offsetValue = parseInt(offset || 0);

    if (query.startsWith('collection.')) {
        const queryParts = query.split(' ');
        const userId = queryParts[0].split('.')[1];
        const searchTerms = queryParts.slice(1).join(' ');

        if (/^\d+$/.test(userId)) {
            let user = userCollectionCache.get(userId);
            if (!user) {
                user = await userCollection.findOne({ id: parseInt(userId) });
                userCollectionCache.set(userId, user);
            }

            if (user) {
                characters = [...new Set(user.characters.map((c) => c.id))].map((id) => user.characters.find((c) => c.id === id));
                if (searchTerms.length) {
                    const regex = new RegExp(searchTerms, 'i');
                    characters = characters.filter((c) => regex.test(c.name) || regex.test(c.anime));
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

    // Slice characters for pagination
    const paginatedCharacters = characters.slice(offsetValue, offsetValue + 10);
    const nextOffset = paginatedCharacters.length === 10 ? offsetValue + 10 : '';

    // Use Promise.all to handle async operations for each character
    const results = await Promise.all(paginatedCharacters.map(async (character) => {
        const globalCount = await userCollection.countDocuments({ 'characters.id': character.id });
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

    res.json({ results, next_offset: nextOffset });
});

app.listen(3000, () => {
  console.log('Server running on port 3000');
});
