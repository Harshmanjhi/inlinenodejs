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
const chatData = new Map();

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

async function reactToMessage(chatId, messageId) {
    const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
    try {
        await bot.telegram.setMessageReaction(chatId, messageId, [{ type: "emoji", emoji: randomEmoji }]);
    } catch (error) {
        console.error("Error setting reaction:", error);
    }
}

async function sendImage(ctx) {
    const chatId = ctx.chat.id.toString();
    const allCharacters = await destinationCharCollection.find({}).toArray().catch(error => {
        console.error("Error fetching characters:", error);
        return [];
    });

    if (!allCharacters || allCharacters.length === 0) {
        await ctx.reply("No characters available to send.");
        return;
    }

    // Initialize chat data if it doesn't exist
    if (!chatData.has(chatId)) {
        chatData.set(chatId, {
            sentCharacters: [],
            lastCharacter: null,
            availableCharacters: allCharacters.filter(c =>
                c.id &&
                c.rarity != null &&
                c.rarity !== '💸 Premium Edition'
            )
        });
    }

    const chatDataObj = chatData.get(chatId);

    // Reset sentCharacters if all have been sent
    if (chatDataObj.sentCharacters.length === allCharacters.length) {
        chatDataObj.sentCharacters = [];
    }

    if (chatDataObj.availableCharacters.length === 0) {
        await ctx.reply("No characters available to send.");
        return; // Exit if no characters are available
    }

    // Calculate cumulative weights
    const cumulativeWeights = [];
    let cumulativeWeight = 0;
    for (const character of chatDataObj.availableCharacters) {
        cumulativeWeight += RARITY_WEIGHTS[character.rarity] || 1;
        cumulativeWeights.push(cumulativeWeight);
    }

    const rand = Math.random() * cumulativeWeight;
    let selectedCharacter = null;

    // Select a character based on random weight
    for (let i = 0; i < chatDataObj.availableCharacters.length; i++) {
        if (rand <= cumulativeWeights[i]) {
            selectedCharacter = chatDataObj.availableCharacters[i];
            break;
        }
    }

    // Fallback if no character was selected
    if (!selectedCharacter) {
        selectedCharacter = chatDataObj.availableCharacters[Math.floor(Math.random() * chatDataObj.availableCharacters.length)];
    }

    // Check if selectedCharacter is still undefined
    if (!selectedCharacter) {
        await ctx.reply("Failed to select a character.");
        return; // Exit if selection fails
    }

    // Update sent characters and last character
    chatDataObj.sentCharacters.push(selectedCharacter.id);
    chatDataObj.lastCharacter = selectedCharacter;

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
    chatDataObj.lastCharacter.message_id = sentMessage.message_id;
}

async function guessCommand(ctx) {
    const chatId = ctx.chat.id.toString();
    const userId = ctx.from.id;

    if (!chatData.has(chatId) || !chatData.get(chatId).lastCharacter) {
        await ctx.reply('There is no active character to guess.');
        return;
    }

    const chatDataObj = chatData.get(chatId);

    if (chatDataObj.firstCorrectGuess) {
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

    const nameParts = chatDataObj.lastCharacter.name.toLowerCase().split(' ');

    if (JSON.stringify(nameParts.sort()) === JSON.stringify(guess.split(' ').sort()) || nameParts.includes(guess)) {
        chatDataObj.firstCorrectGuess = userId;

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

                await destinationCollection.updateOne({ id: userId }, { $push: { characters: chatDataObj.lastCharacter } });
            } else if (ctx.from.username) {
                await destinationCollection.insertOne({
                    id: userId,
                    username: ctx.from.username,
                    first_name: ctx.from.first_name,
                    characters: [chatDataObj.lastCharacter],
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
                `📛 𝗡𝗔𝗠𝗘: <b>${chatDataObj.lastCharacter.name}</b> \n` +
                `🌈 𝗔𝗡𝗜𝗠𝗘: <b>${chatDataObj.lastCharacter.anime}</b> \n` +
                `✨ 𝗥𝗔𝗥𝗜𝗧𝗬: <b>${chatDataObj.lastCharacter.rarity}</b>\n\n` +
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

async function messageCounter(ctx) {
    const chatId = ctx.chat.id.toString();
    const userId = ctx.from.id;
    if (!['group', 'supergroup'].includes(ctx.chat.type)) {
        return;
    }

    // Initialize chat data if it doesn't exist
    if (!chatData.has(chatId)) {
        chatData.set(chatId, {
            lock: new AsyncLock(),
            lastUser: null,
            warnedUsers: new Map(),
            messageCounts: { wordGame: 0, character: 0, mathGame: 0 },
            mathGameActive: false,
            mathAnswer: null,
            wordGameActive: false,
            wordToGuess: null,
            lastCharacter: null,
            firstCorrectGuess: null
        });
    }

    const chatDataObj = chatData.get(chatId);

    await chatDataObj.lock.acquire(chatId, async () => {
        // Anti-spam logic
        if (chatDataObj.lastUser && chatDataObj.lastUser.userId === userId) {
            chatDataObj.lastUser.count += 1;
            if (chatDataObj.lastUser.count >= 10) {
                if (chatDataObj.warnedUsers.has(userId) && Date.now() - chatDataObj.warnedUsers.get(userId) < 600000) {
                    return;
                } else {
                    await ctx.reply(`⚠️ Don't Spam ${ctx.from.first_name}...\nYour Messages Will be ignored for 10 Minutes...`);
                    chatDataObj.warnedUsers.set(userId, Date.now());
                    return;
                }
            }
        } else {
            chatDataObj.lastUser = { userId: userId, count: 1 };
        }

        // Message counting for different game types
        chatDataObj.messageCounts.wordGame += 1;
        chatDataObj.messageCounts.character += 1;
        chatDataObj.messageCounts.mathGame += 1;

        // Trigger different games based on message counts
        if (chatDataObj.messageCounts.wordGame >= 5) {
            if (Math.random() < 0.5) {
                await startMathGame(ctx);
            }
            chatDataObj.messageCounts.wordGame = 0;
        }

        if (chatDataObj.messageCounts.character >= 4) {
            await sendImage(ctx);
            chatDataObj.messageCounts.character = 0;
        }

        // Process ongoing games
        if (chatDataObj.mathGameActive) {
            await processMathGuess(ctx);
        }

        if (chatDataObj.lastCharacter) {
            await processCharacterGuess(ctx);
        }

        if (chatDataObj.wordGameActive) {
            await processWordGuess(ctx);
        }
    });

    // Update user and group statistics
    await updateUserInfo(userId, ctx);
    await updateGroupStatistics(userId, chatId, ctx);
}

async function updateUserInfo(userId, ctx) {
    const user = await  destinationCollection.findOne({ id: userId });
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

function generate_equation(level = null) {
    if (level === null) {
        level = Math.floor(Math.random() * 4) + 1;
    }

    let num1, num2, operator;
    if (level === 1) {
        num1 = Math.floor(Math.random() * 20) + 1;
        num2 = Math.floor(Math.random() * 20) + 1;
        operator = ['+', '-', 'x'][Math.floor(Math.random() * 3)];
    } else if (level === 2) {
        num1 = Math.floor(Math.random() * 50) + 1;
        num2 = Math.floor(Math.random() * 50) + 1;
        operator = ['+', '-', 'x', '/'][Math.floor(Math.random() * 4)];
    } else if (level === 3) {
        num1 = Math.floor(Math.random() * 100) + 1;
        num2 = Math.floor(Math.random() * 10) + 1;
        operator = ['+', '-', 'x', '/', '^'][Math.floor(Math.random() * 5)];
    } else if (level === 4) {
        num1 = Math.floor(Math.random() * 150) + 50;
        num2 = Math.floor(Math.random() * 20) + 1;
        operator = ['+', '-', 'x', '/', '^'][Math.floor(Math.random() * 5)];
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

async function create_equation_image(equation, width = 1060, height = 596) {
    const response = await axios.get('https://files.catbox.moe/rbz6no.jpg', { responseType: 'arraybuffer' });
    const background = await loadImage(response.data);

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    ctx.drawImage(background, 0, 0, width, height);

    const fontSize = 80;
    ctx.font = `${fontSize}px DejaVuSans-Bold`;
    ctx.fillStyle = 'black';

    const textWidth = ctx.measureText(equation).width;
    const textHeight = fontSize;
    const x = (width - textWidth) / 2;
    const y = (height + textHeight) / 2;

    ctx.fillText(equation, x, y);

    const buffer = canvas.toBuffer('image/png');
    return buffer;
}

async function startMathGame(ctx) {
    const chatId = ctx.chat.id.toString();
    const chatDataObj = chatData.get(chatId);
    
    const [problem, answer, level] = generate_equation();
    const img = await create_equation_image(problem);

    await ctx.telegram.sendPhoto(chatId, { source: img }, { caption: 'Solve this math problem!' });

    chatDataObj.mathGameActive = true;
    chatDataObj.mathAnswer = answer;
}

async function processMathGuess(ctx) {
    const chatId = ctx.chat.id.toString();
    const chatDataObj = chatData.get(chatId);
    const userId = ctx.from.id;
    const guess = ctx.message.text.trim();

    if (!chatDataObj.mathGameActive) {
        await ctx.reply('There is no active math game at the moment.');
        return;
    }

    const correctAnswer = chatDataObj.mathAnswer;
    if (correctAnswer === null) {
        await ctx.reply('Something went wrong! Please start a new game.');
        return;
    }

    if (guess === correctAnswer) {
        chatDataObj.mathGameActive = false;
        chatDataObj.mathAnswer = null;

        await reactToMessage(chatId, ctx.message.message_id);

        let user = await ctx.db.destinationCollection.findOne({ id: userId });
        if (user) {
            const currentBalance = user.balance || 0;
            const newBalance = currentBalance + 40;
            await ctx.db.destinationCollection.updateOne({ id: userId }, { $set: { balance: newBalance } });
            await ctx.reply(`🎉 Congratulations ${ctx.from.first_name}! You solved the math problem correctly!\nYour new balance is ${newBalance} coins.`);
        } else {
            const newBalance = 40;
            await ctx.db.destinationCollection.insertOne({ id: userId, balance: newBalance });
            await ctx.reply(`🎉 Congratulations ${ctx.from.first_name}! You solved the math problem correctly!\nYou've earned 40 coins!`);
        }

        await updateStatistics(userId, chatId, ctx);
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

function create_hidden_word(word) {
    if (word.length <= 4) {
        return `${word[0]} ${'_ '.repeat(word.length - 2)}${word[word.length - 1]}`;
    } else if (word.length <= 6) {
        const middle = Math.floor(word.length / 2);
        return `${word[0]} ${'_ '.repeat(middle - 1)}${word[middle]} ${'_ '.repeat(word.length - middle - 2)}${word[word.length - 1]}`;
    } else {
        const third = Math.floor(word.length / 3);
        const two_thirds = 2 * third;
        return `${word[0]} ${'_ '.repeat(third - 1)}${word[third]} ${'_ '.repeat(third - 1)}${word[two_thirds]} ${'_ '.repeat(word.length - two_thirds - 2)}${word[word.length - 1]}`;
    }
}

async function create_word_image(word, width = 1060, height = 596) {
    const response = await axios.get('https://files.catbox.moe/rbz6no.jpg', { responseType: 'arraybuffer' });
    const background = await loadImage(response.data);

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    ctx.drawImage(background, 0, 0, width, height);

    const fontSize = 80;
    ctx.font = `${fontSize}px DejaVuSans-Bold`;
    ctx.fillStyle = 'black';

    const hidden_word = create_hidden_word(word);
    const textWidth = ctx.measureText(hidden_word).width;
    const textHeight = fontSize;
    const x = (width - textWidth) / 2;
    const y = (height + textHeight) / 2;

    ctx.fillText(hidden_word, x, y);

    const buffer = canvas.toBuffer('image/png');
    return buffer;
}

async function startWordGame(ctx) {
    const chatId = ctx.chat.id.toString();
    const chatDataObj = chatData.get(chatId);

    const word = words[Math.floor(Math.random() * words.length)];
    const img_bytes = await create_word_image(word);

    await ctx.telegram.sendPhoto(chatId, { source: img_bytes }, { caption: 'A new word has appeared! Can you guess what it is?' });

    chatDataObj.wordGameActive = true;
    chatDataObj.wordToGuess = word;
}

async function processWordGuess(ctx) {
    const chatId = ctx.chat.id.toString();
    const chatDataObj = chatData.get(chatId);
    const userId = ctx.from.id;
    const guess = ctx.message.text.toLowerCase();

    if (!chatDataObj.wordToGuess) {
        return;
    }

    const correctWord = chatDataObj.wordToGuess;

    if (guess === correctWord) {
        chatDataObj.wordGameActive = false;
        chatDataObj.wordToGuess = null;

        await reactToMessage(chatId, ctx.message.message_id);

        let user = await ctx.db.destinationCollection.findOne({ id: userId });
        if (user) {
            const currentBalance = user.balance || 0;
            const newBalance = currentBalance + 40;
            await ctx.db.destinationCollection.updateOne({ id: userId }, { $set: { balance: newBalance } });

            await ctx.reply(`🎉 Congratulations ${ctx.from.first_name}! You guessed the word correctly: ${correctWord}\nYou've earned 40 coins! Your new balance is ${newBalance} coins.`);
        } else {
            await ctx.db.destinationCollection.insertOne({ id: userId, balance: 40 });

            await ctx.reply(`🎉 Congratulations ${ctx.from.first_name}! You guessed the word correctly: ${correctWord}\nYou've earned 40 coins! Your new balance is 40 coins.`);
        }

        await updateGroupStatistics(userId, chatId, ctx);
    }
}

bot.use((ctx, next) => {
    ctx.db = {
        userTotalsCollection,
        groupUserTotalsCollection,
        topGlobalGroupsCollection,
        pmUsersCollection,
        destinationCollection,
        destinationCharCollection
    };
    return next();
});

bot.command('start', start);
bot.command('bal', balance);
bot.command('pay', pay);
bot.command('mtop', mtop);
bot.command('ctop', ctop);
bot.command('gtop', globalLeaderboard);
bot.command('stats', stats);
bot.command('harem', harem);
bot.command('fav', favCommand);
bot.command('guess', guessCommand);
bot.command('now', nowCommand);
bot.command('daily', dailyReward);
bot.command('top', handleTopCommand);

bot.on('callback_query', haremCallback);
bot.on('inline_query', inlineQuery);

bot.on('message', messageCounter);

bot.catch((err, ctx) => {
    console.error(`Error for ${ctx.updateType}`, err);
});

async function startBot() {
    await connectToDatabase();
    await bot.launch();
    console.log('Bot is running');
}

startBot();

app.get('/', (req, res) => {
    res.send('Hello World!');
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
