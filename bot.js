const express = require('express');
const { Telegraf, Markup } = require('telegraf');
const { createCanvas, loadImage } = require('canvas');
const axios = require('axios');
const sharp = require('sharp');
const AsyncLock = require('async-lock');
const { harem, haremCallback } = require('./modules/harem');
const { inlineQuery } = require('./modules/inline');
const { start } = require('./modules/start');
const { balance, pay, mtop, dailyReward } = require('./modules/bal'); 
const { ctop, globalLeaderboard, stats, sendUsersDocument, sendGroupsDocument, handleTopCommand } = require('./modules/top');
const fs = require('fs');
const path = require('path');
const app = express();
const port = 8000;  // Hardcoded port number

require('dotenv').config();

// Use these variables in your code
const URL = 'https://firsetryp.onrender.com';
const CHAT_ID = '-1002059626060';
const OWNER_ID = 6359642834;
const MUST_JOIN = "DDW_PFP_02";

// Emojis and words for games
const emojis = ["👍", "😘", "❤️", "🔥", "🥰", "🤩", "💘", "💯", "✨", "⚡️", "🏆", "🤭", "🎉"];

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

async function importModules() {
  const modulesDir = path.join(__dirname, 'modules');
  const files = fs.readdirSync(modulesDir);

  for (const file of files) {
    if (file.endsWith('.js')) {
      const modulePath = path.join(modulesDir, file);
      try {
        const module = require(modulePath);
        
        // If the module exports a function, run it with the bot instance
        if (typeof module === 'function') {
          module(bot);
        } 
        // If the module exports an object with setup function, run it
        else if (typeof module === 'object' && typeof module.setup === 'function') {
          module.setup(bot);
        }
        // Otherwise, assume it exports individual handlers and register them
        else if (typeof module === 'object') {
          Object.entries(module).forEach(([key, handler]) => {
            if (typeof handler === 'function') {
              bot.use(handler);
            }
          });
        }
        
        console.log(`Loaded module: ${file}`);
      } catch (error) {
        console.error(`Error loading module ${file}:`, error);
      }
    }
  }
}

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

    const user = await destinationCollection.findOne({ id: userId });
    if (!user) {
        await ctx.reply('You have not Guessed any characters yet....');
        return;
    }

    const character = user.characters.find(c => c.id === characterId);
    if (!character) {
        await ctx.reply('This Character is Not In your collection');
        return;
    }

    await destinationCollection.updateOne({ id: userId }, { $set: { favorites: [characterId] } });

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
// Merged Message handler
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
        // Check if the user is the same and update the spam count
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

        // Initialize message counts for games if not present
        if (!(chatId in messageCounts)) {
            messageCounts[chatId] = { wordGame: 0, character: 0, mathGame: 0 };
        }

        // Increment word game count
        messageCounts[chatId].wordGame += 1;
        messageCounts[chatId].character += 1;
        messageCounts[chatId].mathGame += 1;

        // Randomly start math game when wordGame count reaches 75 (or 5 for testing)
        if (messageCounts[chatId].wordGame >= 5) {
            if (Math.random() < 0.5) {
                await startMathGame(ctx);
            }
            messageCounts[chatId].wordGame = 0;
        }

        // Send character image if count reaches 100
        if (messageCounts[chatId].character >= 10) {
            await sendImage(ctx);
            messageCounts[chatId].character = 0;
        }

        // Process math game guess if active
        if (ctx.chat.mathGameActive) {
            await processMathGuess(ctx);
        }

        // Process word game guess if active
        if (ctx.chat.wordGameActive) {
            await processWordGuess(ctx);
        }

        // Process character guess if active
        if (chatId in lastCharacters) {
            const guess = ctx.message.text.toLowerCase();
            const nameParts = lastCharacters[chatId].name.toLowerCase().split(' ');

            if (JSON.stringify(nameParts.sort()) === JSON.stringify(guess.split(' ').sort()) || nameParts.includes(guess)) {
                // Correct guess logic
                firstCorrectGuesses[chatId] = userId;
                const user = await ctx.db.destinationCollection.findOne({ id: userId });

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
                    await ctx.db.destinationCollection.updateOne({ id: userId }, { $push: { characters: lastCharacters[chatId] } });
                } else if (ctx.from.username) {
                    await ctx.db.destinationCollection.insertOne({
                        id: userId,
                        username: ctx.from.username,
                        first_name: ctx.from.first_name,
                        characters: [lastCharacters[chatId]],
                    });
                }

                await reactToMessage(chatId, ctx.message.message_id);

                const userBalance = await ctx.db.destinationCollection.findOne({ id: userId });
                let newBalance = 40;

                if (userBalance) {
                    newBalance = (userBalance.balance || 0) + 40;
                    await ctx.db.destinationCollection.updateOne({ id: userId }, { $set: { balance: newBalance } });
                } else {
                    await ctx.db.destinationCollection.insertOne({ id: userId, balance: newBalance });
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
            }
        }
    });

    // Update user information and group statistics
    await updateUserInfo(userId, ctx);
    await updateGroupStatistics(userId, chatId, ctx);
}

// Helper functions for statistics updates
async function updateUserInfo(userId, ctx) {
    const user = await ctx.db.destinationCollection.findOne({ id: userId });
    if (user) {
        const updateFields = {};
        if (ctx.from.username && ctx.from.username !== user.username) {
            updateFields.username = ctx.from.username;
        }
        if (ctx.from.first_name !== user.first_name) {
            updateFields.first_name = ctx.from.first_name;
        }
        if (Object.keys(updateFields).length > 0) {
            await ctx.db.destinationCollection.updateOne({ id: userId }, { $set: updateFields });
        }
    } else {
        console.error('Collection or user not found!');
    }
}

async function updateGroupStatistics(userId, chatId, ctx) {
    const groupUserTotal = await ctx.db.groupUserTotalsCollection.findOne({ user_id: userId, group_id: chatId });
    if (groupUserTotal) {
        const updateFields = {};
        if (ctx.from.username && ctx.from.username !== groupUserTotal.username) {
            updateFields.username = ctx.from.username;
        }
        if (ctx.from.first_name !== groupUserTotal.first_name) {
            updateFields.first_name = ctx.from.first_name;
        }
        if (Object.keys(updateFields).length > 0) {
            await ctx.db.groupUserTotalsCollection.updateOne({ user_id: userId, group_id: chatId }, { $set: updateFields });
        }
        
        await ctx.db.groupUserTotalsCollection.updateOne({ user_id: userId, group_id: chatId }, { $inc: { count: 1 } });
    } else {
        await ctx.db.groupUserTotalsCollection.insertOne({
            user_id: userId,
            group_id: chatId,
            username: ctx.from.username,
            first_name: ctx.from.first_name,
            count: 1,
        });
    }

    const groupInfo = await ctx.db.topGlobalGroupsCollection.findOne({ group_id: chatId });
    if (groupInfo) {
        const updateFields = {};
        if (ctx.chat.title !== groupInfo.group_name) {
            updateFields.group_name = ctx.chat.title;
        }
        if (Object.keys(updateFields).length > 0) {
            await ctx.db.topGlobalGroupsCollection.updateOne({ group_id: chatId }, { $set: updateFields });
        }
        
        await ctx.db.topGlobalGroupsCollection.updateOne({ group_id: chatId }, { $inc: { count: 1 } });
    } else {
        await ctx.db.topGlobalGroupsCollection.insertOne({
            group_id: chatId,
            group_name: ctx.chat.title,
            count: 1,
        });
    }
}

const OPERATIONS = ['+', '-', 'x', '/', '^'];

function generateEquation(level = null) {
    if (level === null) {
        level = Math.floor(Math.random() * 4) + 1;
    }

    let num1, num2, operator;
    if (level === 1) {
        num1 = Math.floor(Math.random() * 20) + 1;
        num2 = Math.floor(Math.random() * 20) + 1;
        operator = OPERATIONS[Math.floor(Math.random() * 3)];
    } else if (level === 2) {
        num1 = Math.floor(Math.random() * 50) + 1;
        num2 = Math.floor(Math.random() * 50) + 1;
        operator = OPERATIONS[Math.floor(Math.random() * 4)];
    } else if (level === 3) {
        num1 = Math.floor(Math.random() * 100) + 1;
        num2 = Math.floor(Math.random() * 10) + 1;
        operator = OPERATIONS[Math.floor(Math.random() * 5)];
    } else if (level === 4) {
        num1 = Math.floor(Math.random() * 150) + 50;
        num2 = Math.floor(Math.random() * 20) + 1;
        operator = OPERATIONS[Math.floor(Math.random() * 5)];
    }

    let answer;
    if (operator === '+') {
        answer = num1 + num2;
    } else if (operator === '-') {
        answer = num1 - num2;
    } else if (operator === 'x') {
        answer = num1 * num2;
    } else if (operator === '/') {
        num1 = Math.floor(Math.random() * 100) + 1;
        const factors = Array.from({ length: num1 }, (_, i) => i + 1).filter(i => num1 % i === 0);
        num2 = factors[Math.floor(Math.random() * factors.length)];
        answer = Math.floor(num1 / num2);
    } else if (operator === '^') {
        answer = Math.pow(num1, num2);
    }

    const problem = `${num1} ${operator} ${num2}`;
    return [problem, answer.toString(), level];
}

async function createEquationImage(equation, width = 1060, height = 596) {
    const response = await axios.get("https://files.catbox.moe/rbz6no.jpg", { responseType: 'arraybuffer' });
    const buffer = Buffer.from(response.data);
    const background = await loadImage(buffer);

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    ctx.drawImage(background, 0, 0, width, height);

    ctx.font = '80px DejaVuSans-Bold';
    ctx.fillStyle = 'black';
    const textWidth = ctx.measureText(equation).width;
    const textHeight = 80;
    const positionX = (width - textWidth) / 2;
    const positionY = (height + textHeight) / 2;

    ctx.fillText(equation, positionX, positionY);

    return canvas.toBuffer('image/png');
}


async function startMathGame(ctx) {
    const chatId = ctx.chat.id;

    const [problem, answer, level] = generateEquation();
    const img = await createEquationImage(problem);

    await ctx.replyWithPhoto(
        { source: img },
        { caption: "Solve this math problem!" }
    );

    // Set math game state
    ctx.chat.mathGameActive = true;
    ctx.chat.mathAnswer = answer;
    console.log(`Math problem started: ${problem} = ${answer}`); // Debug info
}

async function processMathGuess(ctx) {
    const chatId = ctx.chat.id;
    const userId = ctx.from.id;
    const guess = ctx.message.text.trim();

    // Check if the game is active
    if (!ctx.chat.mathGameActive) {
        await ctx.reply('There is no active math game at the moment.');
        return;
    }

    // Ensure there is an answer to compare with
    const correctAnswer = ctx.chat.mathAnswer;
    if (!correctAnswer) {
        await ctx.reply('Something went wrong! Please start a new game.');
        return;
    }

    // Check if the user's guess is correct
    if (guess === correctAnswer) {
        ctx.chat.mathGameActive = false;  // Deactivate the game after correct guess
        delete ctx.chat.mathAnswer;

        await reactToMessage(chatId, ctx.message.message_id);

        // Fetch or create user balance
        let user = await ctx.db.destinationCollection.findOne({ id: userId });
        if (user) {
            const currentBalance = user.balance || 0;
            const newBalance = currentBalance + 40;
            await ctx.db.destinationCollection.updateOne({ id: userId }, { $set: { balance: newBalance } });
            const balanceMessage = `Your new balance is ${newBalance} coins.`;

            // Send success message with balance update
            await ctx.reply(
                `🎉 Congratulations ${ctx.from.first_name}! You solved the math problem correctly!\n` +
                `You've earned 40 coins! ${balanceMessage}`
            );
        } else {
            // Create a new user with balance
            const newBalance = 40;
            await ctx.db.destinationCollection.insertOne({ id: userId, balance: newBalance });

            await ctx.reply(
                `🎉 Congratulations ${ctx.from.first_name}! You solved the math problem correctly!\n` +
                "You've earned 40 coins! Your new balance is 40 coins."
            );
        }
    } else {
        // If the guess is incorrect
        await ctx.reply(`❌ Incorrect! Try again.`);
    }
}


const words = [
    "dog", "cat", "bird", "lion", "tiger", "elephant", "monkey", "zebra",
    "apple", "banana", "grape", "honey", "juice",
    "kite", "mountain", "ocean", "river", "sun", "tree",
    "umbrella", "water", "car", "garden", "hat", "island",
    "lemon", "orange", "road", "stone", "train",
    "vase", "window", "yarn", "zoo", "ant", "eagle", "fox",
    "goat", "hippo", "iguana", "jellyfish", "kangaroo",
    "lemur", "meerkat", "newt", "penguin", "rabbit",
    "seal", "turtle", "whale", "yak", "wolf", "panther",
    "dolphin", "frog", "horse", "koala", "ostrich", "peacock",
    "reindeer", "shark", "toucan", "viper", "walrus",
    "zebra", "baboon", "cheetah", "deer", "elephant",
    "flamingo", "gorilla", "hamster", "iguana", "jaguar",
    "koala", "lemur", "mongoose", "narwhal", "owl",
    "parrot", "quetzal", "raven", "sloth", "toucan",
    "vulture", "zebra", "alligator", "buffalo", "dolphin",
    "flamingo", "giraffe", "hummingbird", "iguana", "jackal",
    "kangaroo", "lemur", "macaw", "narwhal", "parrot",
    "quail", "reindeer", "sloth", "toucan", "wallaby",
    "xenops", "yak", "zebra", "alligator", "baboon",
    "camel", "donkey", "falcon", "hippo", "jackrabbit",
    "koala", "mongoose", "owl", "raven", "seagull",
    "tapir", "viper", "wombat", "xenops", "yak", "zebra",
    "rain", "storm", "fog", "wind", "sunshine",
    "rainbow", "hurricane", "snow", "dew", "frost",
    "clear", "gust", "overcast", "sunny", "flood",
    "swelter", "stormy", "calm", "cold", "hot", "cool",
    "mild", "refreshing", "warm", "scorching", "boiling",
    "foggy", "snowy", "windy", "rainy", "sunset", "dusk",
    "afternoon", "morning", "midnight", "midday",
    "starlight", "moonlight", "weekday", "weekend", "year",
    "century", "millennium", "moment", "minute", "hour",
    "day", "week", "year", "era", "epoch", "event",
    "circumstance", "condition", "case", "instance",
    "background", "location", "place", "spot", "city",
    "town", "village", "street", "road", "path",
    "trail", "intersection", "block", "house", "apartment",
    "office", "store", "shop", "market", "mall",
    "hotel", "restaurant", "bar", "club", "theater",
    "museum", "stadium", "park", "school", "college",
    "hospital", "pharmacy", "bank", "library", "church",
    "temple", "mosque", "shrine", "palace", "castle",
    "monument", "statue", "tower", "factory", "warehouse",
    "farm", "ranch", "workshop", "studio"
];

function createHiddenWord(word) {
    if (word.length <= 4) {
        return `${word[0]} ${'_ '.repeat(word.length - 2)}${word[word.length - 1]}`;
    } else if (word.length <= 6) {
        const middle = Math.floor(word.length / 2);
        return `${word[0]} ${'_ '.repeat(middle - 1)}${word[middle]} ${'_ '.repeat(word.length - middle - 2)}${word[word.length - 1]}`;
    } else {
        const third = Math.floor(word.length / 3);
        const twoThirds = 2 * third;
        return `${word[0]} ${'_ '.repeat(third - 1)}${word[third]} ${'_ '.repeat(third - 1)}${word[twoThirds]} ${'_ '.repeat(word.length - twoThirds - 2)}${word[word.length - 1]}`;
    }
}

async function createWordImage(word, width = 1060, height = 596) {
    const response = await fetch("https://files.catbox.moe/rbz6no.jpg");
    const background = await loadImage(await response.buffer());

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    ctx.drawImage(background, 0, 0, width, height);

    ctx.font = '80px DejaVuSans-Bold';
    ctx.fillStyle = 'black';
    const hiddenWord = createHiddenWord(word);
    const textWidth = ctx.measureText(hiddenWord).width;
    const textHeight = 80;
    const positionX = (width - textWidth) / 2;
    const positionY = (height + textHeight) / 2;

    ctx.fillText(hiddenWord, positionX, positionY);

    const imgBuffer = canvas.toBuffer('image/png');
    return imgBuffer;
}

async function startWordGame(ctx) {
    const chatId = ctx.chat.id;

    const word = words[Math.floor(Math.random() * words.length)];
    const imgBytes = await createWordImage(word);

    await ctx.replyWithPhoto(
        { source: imgBytes },
        { caption: "A new word has appeared! Can you guess what it is?" }
    );

    ctx.chat.wordGameActive = true;
    ctx.chat.wordToGuess = word;
}

async function processWordGuess(ctx) {
    const chatId = ctx.chat.id;
    const userId = ctx.from.id;
    const guess = ctx.message.text.toLowerCase();

    if (!ctx.chat.wordToGuess) {
        return;
    }

    const correctWord = ctx.chat.wordToGuess;

    if (guess === correctWord) {
        delete ctx.chat.wordToGuess;
        ctx.chat.wordGameActive = false;

        await reactToMessage(chatId, ctx.message.message_id);

        let user = await ctx.db.destinationCollection.findOne({ id: userId });
        if (user) {
            const currentBalance = user.balance || 0;
            const newBalance = currentBalance + 40;
            await ctx.db.destinationCollection.updateOne({ id: userId }, { $set: { balance: newBalance } });

            await ctx.reply(
                `🎉 Congratulations ${ctx.from.first_name}! You guessed the word correctly: ${correctWord}\n` +
                `You've earned 40 coins! Your new balance is ${newBalance} coins.`
            );
        } else {
            await ctx.db.destinationCollection.insertOne({ id: userId, balance: 40 });

            await ctx.reply(
                `🎉 Congratulations ${ctx.from.first_name}! You guessed the word correctly: ${correctWord}\n` +
                "You've earned 40 coins! Your new balance is 40 coins."
            );
        }

        let groupUserTotal = await ctx.db.groupUserTotalsCollection.findOne({ user_id: userId, group_id: chatId });
        if (groupUserTotal) {
            const updateFields = {};
            if (ctx.from.username && ctx.from.username !== groupUserTotal.username) {
                updateFields.username = ctx.from.username;
            }
            if (ctx.from.first_name !== groupUserTotal.first_name) {
                updateFields.first_name = ctx.from.first_name;
            }
            if (Object.keys(updateFields).length > 0) {
                await ctx.db.groupUserTotalsCollection.updateOne({ user_id: userId, group_id: chatId }, { $set: updateFields });
            }

            await ctx.db.groupUserTotalsCollection.updateOne({ user_id: userId, group_id: chatId }, { $inc: { count: 1 } });
        } else {
            await ctx.db.groupUserTotalsCollection.insertOne({
                user_id: userId,
                group_id: chatId,
                username: ctx.from.username,
                first_name: ctx.from.first_name,
                
                count: 1,
            });
        }

        let groupInfo = await ctx.db.topGlobalGroupsCollection.findOne({ group_id: chatId });
        if (groupInfo) {
            const updateFields = {};
            if (ctx.chat.title !== groupInfo.group_name) {
                updateFields.group_name = ctx.chat.title;
            }
            if (Object.keys(updateFields).length > 0) {
                await ctx.db.topGlobalGroupsCollection.updateOne({ group_id: chatId }, { $set: updateFields });
            }

            await ctx.db.topGlobalGroupsCollection.updateOne({ group_id: chatId }, { $inc: { count: 1 } });
        } else {
            await ctx.db.topGlobalGroupsCollection.insertOne({
                group_id: chatId,
                group_name: ctx.chat.title,
                count: 1,
            });
        }
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

module.exports = {
    reactToMessage
};

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
bot.command('top', handleTopCommand);

// bal.js
bot.command(['balance', 'cloins', 'mybalance', 'mycoins'], balance);
bot.command(['pay', 'coinpay', 'paycoin', 'coinspay', 'paycoins'], pay);
bot.command(['mtop', 'topcoins', 'coinstop', 'cointop'], mtop);
bot.command(['dailyreward', 'dailytoken', 'daily', 'bonus', 'reward'], dailyReward);

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



importModules().then(() => {
  connectToDatabase();
  bot.launch();
  console.log('Bot is running!');
}).catch(error => {
  console.error('Failed to start the bot:', error);
});

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

