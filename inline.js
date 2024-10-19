// Import required packages
const { Telegraf, Markup } = require('telegraf'); // Removed InlineQueryResultPhoto since it's not needed
const MongoClient = require('mongodb').MongoClient;
const Cache = require('node-cache');
const escapeHtml = require('escape-html'); // For HTML escaping

// Replace with your actual bot token and MongoDB connection string
const BOT_TOKEN = '7971272234:AAEJSkfRjDFjCJk-vcu2D_NFVEmC67e_ttk'; // Insert your bot token here
const MONGO_URI = 'mongodb+srv://harshmanjhi1801:webapp@cluster0.xxwc4.mongodb.net/?retryWrites=true&w=majority';

// Initialize bot and MongoDB client
const bot = new Telegraf(BOT_TOKEN);
const mongoClient = new MongoClient(MONGO_URI);

// Caches
const allCharactersCache = new Cache({ stdTTL: 36000 });
const userCollectionCache = new Cache({ stdTTL: 60 });

// Connect to MongoDB
mongoClient.connect()
    .then(() => {
        console.log('Connected to MongoDB');
    })
    .catch(err => {
        console.error('Failed to connect to MongoDB:', err);
    });

// MongoDB collections (adjusted for the new structure)
const db = mongoClient.db('gaming_create');
const userTotalsCollection = db.collection('gaming_totals');
const groupUserTotalsCollection = db.collection('gaming_group_total');
const topGlobalGroupsCollection = db.collection('gaming_global_groups');
const pmUsersCollection = db.collection('gaming_pm_users');
const destinationCollection = db.collection('gaming_user_collection');
const destinationCharCollection = db.collection('gaming_anime_characters');

// Handle inline queries
bot.on('inline_query', async (ctx) => {
    const query = ctx.inlineQuery.query;
    const offset = ctx.inlineQuery.offset ? parseInt(ctx.inlineQuery.offset) : 0;
    let allCharacters = [];

    console.log('Received inline query:', query);

    if (query.startsWith('collection.')) {
        const [userId, ...searchTerms] = query.split(' ')[0].split('.').slice(1);
        const searchQuery = searchTerms.join(' ');

        console.log('User ID:', userId);
        console.log('Search Terms:', searchQuery);

        if (!isNaN(userId)) {
            let user = userCollectionCache.get(userId);

            if (!user) {
                user = await destinationCollection.findOne({ id: parseInt(userId) });
                userCollectionCache.set(userId, user);
            }

            if (user) {
                allCharacters = Array.from(new Set(user.characters.map(v => v.id))).map(id => user.characters.find(v => v.id === id));

                if (searchQuery) {
                    const regexSearch = new RegExp(searchQuery, 'i');
                    allCharacters = allCharacters.filter(character => regexSearch.test(character.name) || regexSearch.test(character.anime));
                }
            }
        }
    } else {
        const regexSearch = new RegExp(query, 'i');
        allCharacters = await destinationCharCollection.find({
            $or: [{ name: regexSearch }, { anime: regexSearch }]
        }).toArray();
    }

    if (allCharacters.length === 0) {
        allCharacters = allCharactersCache.get('all_characters') || await destinationCharCollection.find({}).toArray();
        allCharactersCache.set('all_characters', allCharacters);
    }

    console.log('Characters fetched:', allCharacters.length);

    const characters = allCharacters.slice(offset, offset + 10);
    const nextOffset = characters.length > 10 ? (offset + 10).toString() : (offset + characters.length).toString();

    const results = characters.map(character => {
        let caption;
        if (query.startsWith('collection.')) {
            // Get user's count of this character and characters from the same anime
            const userCharacterCount = user.characters.filter(c => c.id === character.id).length;
            const userAnimeCharacters = user.characters.filter(c => c.anime === character.anime).length;

            caption = `
<b>🌟 Look At <a href='tg://user?id=${user.id}'>${escapeHtml(user.first_name || user.id.toString())}</a>'s Character 🌟</b>\n
🌸: <b>${character.name} (x${userCharacterCount})</b>\n
🏖️: <b>${character.anime} (${userAnimeCharacters}/${character.animeCount})</b>\n
<b>${character.rarity}</b>\n
<b>🆔️:</b> ${character.id}
            `;
        } else {
            caption = `
<b>🌈 Look At This Character!! 🌈</b>\n
🌸: <b>${character.name}</b>\n
🏖️: <b>${character.anime}</b>\n
<b>${character.rarity}</b>\n
🆔️: <b>${character.id}</b>\n
<b>🔍 Globally Guessed: ${character.globalCount || 0} Times...</b>
            `;
        }

        return {
            type: 'photo',
            id: `${character.id}_${Date.now()}`,
            photo_url: character.img_url,
            thumb_url: character.img_url,
            caption: caption,
            parse_mode: 'HTML'
        };
    });

    await ctx.answerInlineQuery(results, { next_offset: nextOffset, cache_time: 5 });
});


// Launch the bot
bot.launch()
    .then(() => {
        console.log('Inline bot is running');
    })
    .catch(err => {
        console.error('Failed to launch bot:', err);
    });
