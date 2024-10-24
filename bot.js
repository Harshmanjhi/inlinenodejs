const express = require('express');
const { Telegraf, Markup } = require('telegraf');
const { createCanvas, loadImage } = require('canvas');
const axios = require('axios');
const sharp = require('sharp');
const AsyncLock = require('async-lock');
const { harem, haremCallback } = require('./modules/harem');
const { inlineQuery } = require('./modules/inline');
const { start } = require('./modules/start');
const { ctop, globalLeaderboard, stats, sendUsersDocument, sendGroupsDocument } = require('./modules/top');
const path = require('path'); 
const app = express();
const port = 3000;  // Hardcoded port number

require('dotenv').config();

// Use these variables in your code
const URL = 'https://firsetryp.onrender.com';
const CHAT_ID = '-1002059626060';
const OWNER_ID = 6359642834;
const MUST_JOIN = "DDW_PFP_02";

// Emojis and words for games
const emojis = ["👍", "😘", "❤️", "🔥", "🥰", "🤩", "💘", "💯", "✨", "⚡️", "🏆", "🤭", "🎉"];
const words = ["dog", "cat", "bird", /* ... other words ... */];

// Rarity weights for character selection
const RARITY_WEIGHTS = {
    "⚪️ Common": 12,
    "🟣 Rare": 0.2,
    "🟡 Legendary": 4.5,
    "🟢 Medium": 12,
    "💮 Special edition": 0.2,
    "🔮 Limited Edition": 0.1
};


// Global variables
const locks = {};
const lastUser = {};
const warnedUsers = {};
const messageCounts = {};
const sentCharacters = {};
const lastCharacters = {};
const firstCorrectGuesses = {};
  
  const bot = new Telegraf(process.env.BOT_TOKEN);
  
  const { MongoClient } = require('mongodb');
  require('dotenv').config();
  
  const MONGODB_URI = process.env.MONGODB_URI;
  const client = new MongoClient(MONGODB_URI);
  
  let db, userTotalsCollection, groupUserTotalsCollection, topGlobalGroupsCollection, pmUsersCollection, destinationCollection, destinationCharCollection;
  
  async function connectToDatabase() {
      try {
          await client.connect();
          console.log('Connected to MongoDB');
  
          // Set the database
          db = client.db('gaming_create'); // Use 'gaming_create' as the database name
  
          // Initialize collections
          userTotalsCollection = db.collection('gaming_totals');
          groupUserTotalsCollection = db.collection('gaming_group_total');
          topGlobalGroupsCollection = db.collection('gaming_global_groups');
          pmUsersCollection = db.collection('gaming_pm_users');
          destinationCollection = db.collection('gamimg_user_collection');
          destinationCharCollection = db.collection('gaming_anime_characters');
  
          console.log('All collections initialized');
      } catch (error) {
          console.error('MongoDB connection error:', error);
          process.exit(1);
      }
  }

// Helper functions
async function reactToMessage(chatId, messageId) {
    const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
    try {
        await bot.telegram.setMessageReaction(chatId, messageId, [{ type: "emoji", emoji: randomEmoji }]);
    } catch (error) {
        console.error("Error setting reaction:", error);
    }
}


async function sendImage(ctx) {
    const chatId = ctx.chat.id;
    const allCharacters = await destinationCharCollection.find({}).toArray();

    // Initialize sentCharacters for the chat if not already done
    if (!sentCharacters[chatId]) {
        sentCharacters[chatId] = [];
    }

    // Reset sentCharacters if all have been sent
    if (sentCharacters[chatId].length === allCharacters.length) {
        sentCharacters[chatId] = [];
    }

    // Initialize availableCharacters in user data
    if (!ctx.user_data) {
        ctx.user_data = {};
    }
    if (!ctx.user_data.available_characters) {
        ctx.user_data.available_characters = allCharacters.filter(c =>
            c.id &&
            !sentCharacters[chatId].includes(c.id) &&
            c.rarity != null &&
            c.rarity !== '💸 Premium Edition'
        );
    }

    const availableCharacters = ctx.user_data.available_characters;

    // Log available characters
    console.log("Available Characters:", availableCharacters);
    if (availableCharacters.length === 0) {
        await ctx.reply("No characters available to send.");
        return; // Exit if no characters are available
    }

    // Calculate cumulative weights
    const cumulativeWeights = [];
    let cumulativeWeight = 0;
    for (const character of availableCharacters) {
        cumulativeWeight += RARITY_WEIGHTS[character.rarity] || 1;
        cumulativeWeights.push(cumulativeWeight);
    }

    const rand = Math.random() * cumulativeWeight;
    let selectedCharacter = null;

    // Select a character based on random weight
    for (let i = 0; i < availableCharacters.length; i++) {
        if (rand <= cumulativeWeights[i]) {
            selectedCharacter = availableCharacters[i];
            break;
        }
    }

    // Fallback if no character was selected
    if (!selectedCharacter) {
        selectedCharacter = availableCharacters[Math.floor(Math.random() * availableCharacters.length)];
    }

    // Check if selectedCharacter is still undefined
    if (!selectedCharacter) {
        await ctx.reply("Failed to select a character.");
        return; // Exit if selection fails
    }

    // Update sent characters and last character
    sentCharacters[chatId].push(selectedCharacter.id);
    lastCharacters[chatId] = selectedCharacter;

    // Generate a character code
    const characterCode = `#${Math.floor(Math.random() * 90000) + 10000}`;
    selectedCharacter.code = characterCode;

    // Send the character image and store the message ID
    const sentMessage = await ctx.replyWithPhoto(selectedCharacter.img_url, {
        caption: `✨ A Wild ${selectedCharacter.rarity} Character Appeared! ✨\n` +
                 `🔍 Use /guess to identify and add this mysterious character to your Harem!\n` +
                 `💫 Quick, before someone else claims them!`,
        parse_mode: 'Markdown'
    });

    // Store the message ID for later use
    lastCharacters[chatId].message_id = sentMessage.message_id;
}

// Command handlers
async function guessCommand(ctx) {
    const chatId = ctx.chat.id;
    const userId = ctx.from.id;

    if (!(chatId in lastCharacters)) {
        await ctx.reply('There is no active character to guess.');
        return;
    }

    if (chatId in firstCorrectGuesses) {
        await ctx.reply('❌ Oops! Someone already guessed this character. Better luck next time, adventurer! 🍀');
        return;
    }

    const guess = ctx.message.text.split(' ').slice(1).join(' ').toLowerCase();

    if (!guess) {
        await ctx.reply('Please provide a guess after the command.');
        return;
    }

    if (guess.includes("()") || guess.includes("&")) {
        await ctx.reply("Nah, you can't use these types of words in your guess... ❌️");
        return;
    }

    const nameParts = lastCharacters[chatId].name.toLowerCase().split(' ');

    if (JSON.stringify(nameParts.sort()) === JSON.stringify(guess.split(' ').sort()) || nameParts.includes(guess)) {
        firstCorrectGuesses[chatId] = userId;

        try {
            const user = await destinationCollection.findOne({ id: userId });
            if (user) {
                const updateFields = {};
                if (ctx.from.username && ctx.from.username !== user.username) {
                    updateFields.username = ctx.from.username;
                }
                if (ctx.from.first_name !== user.first_name) {
                    updateFields.first_name = ctx.from.first_name;
                }
                if (Object.keys(updateFields).length > 0) {
                    await destinationCollection.updateOne({ id: userId }, { $set: updateFields });
                }

                await destinationCollection.updateOne({ id: userId }, { $push: { characters: lastCharacters[chatId] } });
            } else if (ctx.from.username) {
                await destinationCollection.insertOne({
                    id: userId,
                    username: ctx.from.username,
                    first_name: ctx.from.first_name,
                    characters: [lastCharacters[chatId]],
                });
            }

            await reactToMessage(chatId, ctx.message.message_id);

            const userBalance = await destinationCollection.findOne({ id: userId });
            let newBalance = 40;
            if (userBalance) {
                newBalance = (userBalance.balance || 0) + 40;
                await destinationCollection.updateOne({ id: userId }, { $set: { balance: newBalance } });
            } else {
                await destinationCollection.insertOne({ id: userId, balance: newBalance });
            }

            const keyboard = Markup.inlineKeyboard([
                [Markup.button.switchToChat("See Harem", `collection.${userId}`)]
            ]);

            await ctx.reply(
                `🌟 <b><a href="tg://user?id=${userId}">${ctx.from.first_name}</a></b>, you've captured a new character! 🎊\n\n` +
                `📛 𝗡𝗔𝗠𝗘: <b>${lastCharacters[chatId].name}</b> \n` +
                `🌈 𝗔𝗡𝗜𝗠𝗘: <b>${lastCharacters[chatId].anime}</b> \n` +
                `✨ 𝗥𝗔𝗥𝗜𝗧𝗬: <b>${lastCharacters[chatId].rarity}</b>\n\n` +
                'This magical being has been added to your harem. Use /harem to view your growing collection!',
                { parse_mode: 'HTML', ...keyboard }
            );

        } catch (error) {
            console.error("Error processing correct guess:", error);
            await ctx.reply("An error occurred while processing your guess. Please try again later.");
        }
    } else {
        await ctx.reply('❌ Not quite right, brave guesser! Try again and unveil the mystery character! 🕵️‍♂️');
    }
}

async function favCommand(ctx) {
    const userId = ctx.from.id;

    if (!ctx.message.text.split(' ')[1]) {
        await ctx.reply('Please provide Character id...');
        return;
    }

    const characterId = ctx.message.text.split(' ')[1];

    const user = await userCollection.findOne({ id: userId });
    if (!user) {
        await ctx.reply('You have not Guessed any characters yet....');
        return;
    }

    const character = user.characters.find(c => c.id === characterId);
    if (!character) {
        await ctx.reply('This Character is Not In your collection');
        return;
    }

    await userCollection.updateOne({ id: userId }, { $set: { favorites: [characterId] } });

    await ctx.reply(`Character ${character.name} has been added to your favorite...`);
}

async function nowCommand(ctx) {
    const chatId = ctx.chat.id;
    const userId = ctx.from.id;
    
    if (userId !== OWNER_ID) {
        await ctx.reply("You are not authorized to use this command.");
        return;
    }
    
    const gameType = ctx.message.text.split(' ')[1]?.toLowerCase();
    
    if (!gameType) {
        await ctx.reply("Usage: /now {word|character|math}");
        return;
    }
    
    if (gameType === 'word') {
        await startWordGame(ctx);
    } else if (gameType === 'character') {
        await sendImage(ctx);
    } else if (gameType === 'math') {
        await startMathGame(ctx);
    } else {
        await ctx.reply("Invalid game type. Use 'word', 'character', or 'math'.");
    }
}

// Message handler
async function messageCounter(ctx) {
    const chatId = ctx.chat.id.toString();
    const userId = ctx.from.id;
    if (!['group', 'supergroup'].includes(ctx.chat.type)) {
        return;
    }
    if (!(chatId in locks)) {
        locks[chatId] = new AsyncLock();
    }
    const lock = locks[chatId];
    await lock.acquire(chatId, async () => {
        if (chatId in lastUser && lastUser[chatId].userId === userId) {
            lastUser[chatId].count += 1;
            if (lastUser[chatId].count >= 10) {
                if (userId in warnedUsers && Date.now() - warnedUsers[userId] < 600000) {
                    return;
                } else {
                    await ctx.reply(`⚠️ Don't Spam ${ctx.from.first_name}...\nYour Messages Will be ignored for 10 Minutes...`);
                    warnedUsers[userId] = Date.now();
                    return;
                }
            }
        } else {
            lastUser[chatId] = { userId: userId, count: 1 };
        }
        if (!(chatId in messageCounts)) {
            messageCounts[chatId] = { wordGame: 0, character: 0, mathGame: 0 };
        }
        messageCounts[chatId].wordGame += 1;
        messageCounts[chatId].character += 1;
        messageCounts[chatId].mathGame += 1;
        
        // Randomly start math game if count reaches 75
        if (messageCounts[chatId].wordGame >= 5000000) {
            if (Math.random() < 0.5) {
                await startMathGame(ctx);
            }
            messageCounts[chatId].wordGame = 0;
        }
        
        // Send character image if count reaches 100
        if (messageCounts[chatId].character >= 2) {
            await sendImage(ctx);
            messageCounts[chatId].character = 0;
        }
        
        // Process math game guess if active
        if (ctx.chat.mathGameActive) {
            await processMathGuess(ctx);
        }
        
        // Process character guess if active
        if (chatId in lastCharacters) {
            const guess = ctx.message.text.toLowerCase();
            const nameParts = lastCharacters[chatId].name.toLowerCase().split(' ');
            if (JSON.stringify(nameParts.sort()) === JSON.stringify(guess.split(' ').sort()) || nameParts.includes(guess)) {
                // Correct guess logic
                firstCorrectGuesses[chatId] = userId;
                const user = await destinationCollection.findOne({ id: userId });
                if (user) {
                    const updateFields = {};
                    if (ctx.from.username && ctx.from.username !== user.username) {
                        updateFields.username = ctx.from.username;
                    }
                    if (ctx.from.first_name !== user.first_name) {
                        updateFields.first_name = ctx.from.first_name;
                    }
                    if (Object.keys(updateFields).length > 0) {
                        await destinationCollection.updateOne({ id: userId }, { $set: updateFields });
                    }
                    await destinationCollection.updateOne({ id: userId }, { $push: { characters: lastCharacters[chatId] } });
                } else if (ctx.from.username) {
                    await destinationCollection.insertOne({
                        id: userId,
                        username: ctx.from.username,
                        first_name: ctx.from.first_name,
                        characters: [lastCharacters[chatId]],
                    });
                }
                await reactToMessage(chatId, ctx.message.message_id);
                const userBalance = await destinationCollection.findOne({ id: userId });
                let newBalance = 40;
                if (userBalance) {
                    newBalance = (userBalance.balance || 0) + 40;
                    await destinationCollection.updateOne({ id: userId }, { $set: { balance: newBalance } });
                } else {
                    await destinationCollection.insertOne({ id: userId, balance: newBalance });
                }
                const keyboard = Markup.inlineKeyboard([
                    [Markup.button.switchToChat("See Harem", `collection.${userId}`)]
                ]);
                await ctx.reply(
                    `🌟 <b><a href="tg://user?id=${userId}">${ctx.from.first_name}</a></b>, you've captured a new character! 🎊\n\n` +
                    `📛 𝗡𝗔𝗠𝗘: <b>${lastCharacters[chatId].name}</b> \n` +
                    `🌈 𝗔𝗡𝗜𝗠𝗘: <b>${lastCharacters[chatId].anime}</b> \n` +
                    `✨ 𝗥𝗔𝗥𝗜𝗧𝗬: <b>${lastCharacters[chatId].rarity}</b>\n\n` +
                    'This magical being has been added to your harem. Use /harem to view your growing collection!',
                    { parse_mode: 'HTML', ...keyboard }
                );
                // Update statistics
                await updateStatistics(userId, chatId, ctx);
            }
            // No response for incorrect guesses without the command
        }
        
        // Process word game guess if active
        if (ctx.chat.wordGameActive) {
            await processWordGuess(ctx);
        }
    });
    
    // Update user information
    await updateUserInfo(userId, ctx);
    
    // Update group statistics
    await updateGroupStatistics(userId, chatId, ctx);
}

// Helper functions for statistics updates
async function updateUserInfo(userId, ctx) {
    const user = await destinationCollection.findOne({ id: userId });
    if (user) {
        const updateFields = {};
        if (ctx.from.username && ctx.from.username !== user.username) {
            updateFields.username = ctx.from.username;
        }
        if (ctx.from.first_name !== user.first_name) {
            updateFields.first_name = ctx.from.first_name;
        }
        if (Object.keys(updateFields).length > 0) {
            await destinationCollection.updateOne({ id: userId }, { $set: updateFields });
        }
    }
}

async function updateGroupStatistics(userId, chatId, ctx) {
    const groupUserTotal = await groupUserTotalsCollection.findOne({ user_id: userId, group_id: chatId });
    if (groupUserTotal) {
        const updateFields = {};
        if (ctx.from.username && ctx.from.username !== groupUserTotal.username) {
            updateFields.username = ctx.from.username;
        }
        if (ctx.from.first_name !== groupUserTotal.first_name) {
            updateFields.first_name = ctx.from.first_name;
        }
        if (Object.keys(updateFields).length > 0) {
            await groupUserTotalsCollection.updateOne({ user_id: userId, group_id: chatId }, { $set: updateFields });
        }
        
        await groupUserTotalsCollection.updateOne({ user_id: userId, group_id: chatId }, { $inc: { count: 1 } });
    } else {
        await groupUserTotalsCollection.insertOne({
            user_id: userId,
            group_id: chatId,
            username: ctx.from.username,
            first_name: ctx.from.first_name,
            count: 1,
        });
    }

    const groupInfo = await topGlobalGroupsCollection.findOne({ group_id: chatId });
    if (groupInfo) {
        const updateFields = {};
        if (ctx.chat.title !== groupInfo.group_name) {
            updateFields.group_name = ctx.chat.title;
        }
        if (Object.keys(updateFields).length > 0) {
            await topGlobalGroupsCollection.updateOne({ group_id: chatId }, { $set: updateFields });
        }
        
        await topGlobalGroupsCollection.updateOne({ group_id: chatId }, { $inc: { count: 1 } });
    } else {
        await topGlobalGroupsCollection.insertOne({
            group_id: chatId,
            group_name: ctx.chat.title,
            count: 1,
        });
    }
}


bot.use((ctx, next) => {
    ctx.db = {
        userTotalsCollection,
        groupUserTotalsCollection,
        topGlobalGroupsCollection,
        pmUsersCollection,
        destinationCollection,
        destinationCharCollection,
        collection: destinationCharCollection
    };
    return next();
});

// *
bot.command(['guess', 'protecc', 'collect', 'grab', 'hunt'], guessCommand);
bot.command('fav', favCommand);
bot.command('now', nowCommand);
bot.command(['harem', 'collection'], (ctx) => harem(ctx));
bot.action(/^harem:/, haremCallback);

// top.js
bot.command('ctop', ctop);
bot.command('TopGroups', globalLeaderboard);
bot.command('stats', stats);
bot.command('list', sendUsersDocument);
bot.command('groups', sendGroupsDocument);

// start.js
bot.command('start', start);

// Inline.js
bot.on('inline_query', (ctx) => inlineQuery(ctx)); // Modify this line

// Handle all messages
bot.on('message', messageCounter);

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html')); // Serve index.html from the same directory
});

// Start the Express server with the hardcoded port
app.listen(port, () => {
    console.log(`Web server running on port ${port}`);
});

// Start the bot
async function main() {
    await connectToDatabase();
    bot.launch();
    console.log("Bot started");
}

main();
