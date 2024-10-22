const express = require('express');
const { MongoClient } = require('mongodb');
const NodeCache = require('node-cache');
const { Telegraf } = require('telegraf');

const app = express();
app.use(express.json());

const MONGO_URI = 'mongodb+srv://harshmanjhi1801:webapp@cluster0.xxwc4.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
const DB_NAME = 'gaming_create';
let db, userCollection, characterCollection;

// Cache setup
const allCharactersCache = new NodeCache({ stdTTL: 36000, checkperiod: 600 });
const userCollectionCache = new NodeCache({ stdTTL: 60, checkperiod: 10 });

// Connect to MongoDB
MongoClient.connect(MONGO_URI, { useUnifiedTopology: true })
  .then((client) => {
    db = client.db(DB_NAME);
    userCollection = db.collection('gaming_totals');
    characterCollection = db.collection('gaming_anime_characters');
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

// Initialize Telegram Bot
const bot = new Telegraf('YOUR_BOT_TOKEN'); // Replace with your bot token

bot.on('inline_query', async (ctx) => {
  const query = ctx.inlineQuery.query;
  const offset = parseInt(ctx.inlineQuery.offset) || 0;

  let allCharacters = [];

  if (query.startsWith('collection.')) {
    const [_, userId, ...searchTerms] = query.split(' ');
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
        allCharacters = [...new Set(user.characters.map(c => c.id))]
          .map(id => user.characters.find(c => c.id === id));

        if (searchQuery) {
          const regex = new RegExp(searchQuery, 'i');
          allCharacters = allCharacters.filter(c => regex.test(c.name) || regex.test(c.anime));
        }
      }
    }
  } else {
    if (query) {
      const regex = new RegExp(query, 'i');
      allCharacters = await characterCollection.find({ $or: [{ name: regex }, { anime: regex }] }).toArray();
    } else {
      allCharacters = allCharactersCache.get('all_characters') || await characterCollection.find({}).toArray();
      allCharactersCache.set('all_characters', allCharacters);
    }
  }

  const characters = allCharacters.slice(offset, offset + 10);
  const nextOffset = characters.length === 10 ? offset + 10 : '';

  const results = await Promise.all(characters.map(async (character) => {
    const globalCount = await userCollection.countDocuments({ 'characters.id': character.id });
    const animeCharacters = await characterCollection.countDocuments({ anime: character.anime });

    let caption;
    if (query.startsWith('collection.')) {
      const userCharacterCount = user.characters.filter(c => c.id === character.id).length;
      const userAnimeCharacters = user.characters.filter(c => c.anime === character.anime).length;
      caption = `
        <b>🌟 Look At <a href='tg://user?id=${user.id}'>${escapeHtml(user.first_name || user.id)}</a>'s Character 🌟</b>\n\n
        🌸: <b>${escapeHtml(character.name)} (x${userCharacterCount})</b>\n
        🏖️: <b>${escapeHtml(character.anime)} (${userAnimeCharacters}/${animeCharacters})</b>\n
        <b>${escapeHtml(character.rarity || 'Unknown Rarity')}</b>\n\n
        <b>🆔️:</b> ${escapeHtml(character.id.toString())}
      `;
    } else {
      caption = `
        <b>🌈 Look At This Character!! 🌈</b>\n\n
        🌸: <b>${escapeHtml(character.name)}</b>\n
        🏖️: <b>${escapeHtml(character.anime)}</b>\n
        <b>${escapeHtml(character.rarity || 'Unknown Rarity')}</b>\n
        🆔️: <b>${escapeHtml(character.id.toString())}</b>\n\n
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

  await ctx.answerInlineQuery(results, { next_offset: nextOffset });
});

// Escape HTML function
function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Start the bot
bot.launch().then(() => {
  console.log('Bot is running...');
});
