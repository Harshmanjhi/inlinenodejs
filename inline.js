const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const { MongoClient } = require('mongodb');
const NodeCache = require('node-cache');

const app = express();
app.use(express.json());

// Bot configuration
const BOT_TOKEN = '7971272234:AAHotsNMQfLS6jhIq3-P5dnJAebj3dOG804';
const WEBHOOK_URL = 'https://inlinenodejs.onrender.com/webhook';
const PORT = 8443;

// MongoDB configuration
const MONGO_URI = 'mongodb+srv://harshmanjhi1801:webapp@cluster0.xxwc4.mongodb.net/?retryWrites=true&w=majority';
const DB_NAME = 'gaming_totals';

let db, userCollection, characterCollection;

// Cache setup
const allCharactersCache = new NodeCache({ stdTTL: 36000, checkperiod: 600 });
const userCollectionCache = new NodeCache({ stdTTL: 60, checkperiod: 10 });

// Initialize bot
const bot = new TelegramBot(BOT_TOKEN);
bot.setWebHook(`${WEBHOOK_URL}/bot${BOT_TOKEN}`);

// Connect to MongoDB
async function connectToMongo() {
  const client = new MongoClient(MONGO_URI, { useUnifiedTopology: true });
  await client.connect();
  db = client.db(DB_NAME);
  userCollection = db.collection('users');
  characterCollection = db.collection('characters');

  // Create indexes
  await characterCollection.createIndex({ id: 1 });
  await characterCollection.createIndex({ anime: 1 });
  await characterCollection.createIndex({ img_url: 1 });

  await userCollection.createIndex({ 'characters.id': 1 });
  await userCollection.createIndex({ 'characters.name': 1 });
  await userCollection.createIndex({ 'characters.img_url': 1 });
}

// Inline query handler
async function handleInlineQuery(query) {
  const offset = query.offset ? parseInt(query.offset) : 0;
  let allCharacters = [];

  if (query.query.startsWith('collection.')) {
    const [, userId, ...searchTerms] = query.query.split(/\.|\s/);
    if (/^\d+$/.test(userId)) {
      let user = userCollectionCache.get(userId);
      if (!user) {
        user = await userCollection.findOne({ id: parseInt(userId) });
        if (user) userCollectionCache.set(userId, user);
      }

      if (user) {
        allCharacters = Object.values(user.characters.reduce((acc, char) => {
          acc[char.id] = char;
          return acc;
        }, {}));

        if (searchTerms.length > 0) {
          const regex = new RegExp(searchTerms.join(' '), 'i');
          allCharacters = allCharacters.filter(char => 
            regex.test(char.name) || regex.test(char.anime)
          );
        }
      }
    }
  } else {
    if (query.query) {
      const regex = new RegExp(query.query, 'i');
      allCharacters = await characterCollection.find({
        $or: [{ name: regex }, { anime: regex }]
      }).toArray();
    } else {
      allCharacters = allCharactersCache.get('all_characters');
      if (!allCharacters) {
        allCharacters = await characterCollection.find({}).toArray();
        allCharactersCache.set('all_characters', allCharacters);
      }
    }
  }

  const characters = allCharacters.slice(offset, offset + 10);
  const nextOffset = offset + characters.length < allCharacters.length ? 
    (offset + 10).toString() : '';

  const results = await Promise.all(characters.map(async (character) => {
    const globalCount = await userCollection.countDocuments({ 'characters.id': character.id });
    const animeCharacters = await characterCollection.countDocuments({ anime: character.anime });

    let caption;
    if (query.query.startsWith('collection.')) {
      const user = userCollectionCache.get(query.query.split('.')[1]);
      const userCharacterCount = user.characters.filter(c => c.id === character.id).length;
      const userAnimeCharacters = user.characters.filter(c => c.anime === character.anime).length;
      caption = `<b>🌟 Look At <a href="tg://user?id=${user.id}">${user.first_name || user.id}</a>'s Character 🌟</b>\n\n` +
                `🌸: <b>${character.name} (x${userCharacterCount})</b>\n` +
                `🏖️: <b>${character.anime} (${userAnimeCharacters}/${animeCharacters})</b>\n` +
                `<b>${character.rarity}</b>\n\n` +
                `<b>🆔️:</b> ${character.id}`;
    } else {
      caption = `<b>🌈 Look At This Character!! 🌈</b>\n\n` +
                `🌸: <b>${character.name}</b>\n` +
                `🏖️: <b>${character.anime}</b>\n` +
                `<b>${character.rarity}</b>\n` +
                `🆔️: <b>${character.id}</b>\n\n` +
                `<b>🔍 Globally Guessed: ${globalCount} Times...</b>`;
    }

    return {
      type: 'photo',
      id: `${character.id}_${Date.now()}`,
      photo_url: character.img_url,
      thumb_url: character.img_url,
      caption: caption,
      parse_mode: 'HTML'
    };
  }));

  return {
    results: results,
    next_offset: nextOffset,
    cache_time: 5
  };
}

// Webhook route
app.post(`/bot${BOT_TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// Set up inline query handler
bot.on('inline_query', async (query) => {
  try {
    const answer = await handleInlineQuery(query);
    await bot.answerInlineQuery(query.id, answer.results, {
      next_offset: answer.next_offset,
      cache_time: answer.cache_time
    });
  } catch (error) {
    console.error('Error handling inline query:', error);
  }
});

// Start the server
async function startServer() {
  await connectToMongo();
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}

startServer().catch(console.error);