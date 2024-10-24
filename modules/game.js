const AsyncLock = require('async-lock');
const { createCanvas, loadImage } = require('canvas');
const fetch = require('node-fetch');

const locks = {};
const lastUser = {};
const warnedUsers = {};
const messageCounts = {};
const lastCharacters = {};
const firstCorrectGuesses = {};

const emojis = ["👍", "😘", "❤️", "🔥", "🥰", "🤩", "💘", "💯", "✨", "⚡️", "🏆", "🤭", "🎉"];

async function reactToMessage(chatId, messageId) {
    const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
    try {
        await bot.telegram.setMessageReaction(chatId, messageId, [{ type: "emoji", emoji: randomEmoji }]);
    } catch (error) {
        console.error("Error setting reaction:", error);
    }
}

async function messageCounter2(ctx) {
    const chatId = ctx.chat.id.toString();
    const userId = ctx.from.id;
    
    if (!['group', 'supergroup'].includes(ctx.chat.type)) {
        return;
    }
    
    if (!(chatId in locks)) {
        locks[chatId] = new AsyncLock();
    }
    
    if (!(chatId in messageCounts)) {
        messageCounts[chatId] = { wordGame: 0, character: 0, mathGame: 0 };
    }
    messageCounts[chatId].wordGame += 1;

    // Randomly start math game if count reaches 75
    if (messageCounts[chatId].wordGame >= 5) {
        if (Math.random() < 0.5) {
            await startMathGame(ctx);
        }
        messageCounts[chatId].wordGame = 0;
    }

    // Process math game guess if active
    if (ctx.chat.mathGameActive) {
        await processMathGuess(ctx);
    }

    // Process word game guess if active
    if (ctx.chat.wordGameActive) {
        await processWordGuess(ctx);
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
    const response = await fetch("https://files.catbox.moe/rbz6no.jpg");
    const background = await loadImage(await response.buffer());

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

    const imgBuffer = canvas.toBuffer('image/png');
    return imgBuffer;
}

async function startMathGame(ctx) {
    const chatId = ctx.chat.id;

    const [problem, answer, level] = generateEquation();
    const img = await createEquationImage(problem);

    await ctx.replyWithPhoto(
        { source: img },
        { caption: "Solve this math problem!" }
    );

    ctx.chat.mathGameActive = true;
    ctx.chat.mathAnswer = answer;
}

async function processMathGuess(ctx) {
    const chatId = ctx.chat.id;
    const userId = ctx.from.id;
    const guess = ctx.message.text.trim();

    if (!ctx.chat.mathGameActive) {
        await ctx.reply('There is no active math game at the moment.');
        return;
    }

    const correctAnswer = ctx.chat.mathAnswer;
    if (correctAnswer === null) {
        await ctx.reply('Something went wrong! Please start a new game.');
        return;
    }

    if (guess === correctAnswer) {
        ctx.chat.mathGameActive = false;
        delete ctx.chat.mathAnswer;

        await reactToMessage(chatId, ctx.message.message_id);

        let user = await ctx.db.destinationCollection.findOne({ id: userId });
        if (user) {
            const currentBalance = user.balance || 0;
            const newBalance = currentBalance + 40;
            await ctx.db.destinationCollection.updateOne({ id: userId }, { $set: { balance: newBalance } });
            const balanceMessage = `Your new balance is ${newBalance} coins.`;

            await ctx.reply(
                `🎉 Congratulations ${ctx.from.first_name}! You solved the math problem correctly!\n` +
                `You've earned 40 coins! ${balanceMessage}`
            );
        } else {
            const newBalance = 40;
            await ctx.db.destinationCollection.insertOne({ id: userId, balance: newBalance });

            await ctx.reply(
                `🎉 Congratulations ${ctx.from.first_name}! You solved the math problem correctly!\n` +
                "You've earned 40 coins! Your new balance is 40 coins."
            );
        }
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

module.exports = {
    messageCounter2,
    startMathGame,
    startWordGame,
    processMathGuess,
    processWordGuess
};
