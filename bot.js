import TelegramBot from 'node-telegram-bot-api';
import { MongoClient } from 'mongodb';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { createCanvas, loadImage } from 'canvas';
import schedule from 'node-schedule';
import axios from 'axios';
import AsyncLock from 'async-lock';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CHAT_ID = '-1002337025638';
const OWNER_ID = 7900160187;


export class Bot {
  constructor(token, mongoUrl) {
    this.bot = new TelegramBot(token, { 
      polling: true,
      cancelAfter: 30000 // Enable cancellation after 30 seconds
    });
    this.mongoClient = new MongoClient(mongoUrl, { useNewUrlParser: true, useUnifiedTopology: true });
    this.db = null;
    this.modules = new Map();
    this.collections = {};
    this.locks = {};
    this.lastUser = {};
    this.warnedUsers = {};
    this.messageCounts = {};
    this.lastCharacters = {};
    this.sentCharacters = {};
    this.firstCorrectGuesses = {};
    this.words = [
      "dog", "cat", "bird", "lion", "tiger", "elephant", "monkey", "zebra",
      "apple", "banana", "grape", "honey", "juice", 
      // ... (add all the words from the Python version here)
    ];
    this.emojis = ["👍", "😘", "❤️", "🔥", "🥰", "🤩", "💘", "💯", "✨", "⚡️", "🏆", "🤭", "🎉"];
  }

  async start() {
    await this.connectToMongo();
    await this.loadModules();
    this.setupEventHandlers();
    this.setupScheduler();
  }

  async connectToMongo() {
    await this.mongoClient.connect();
    this.db = this.mongoClient.db('gaming_create');
    console.log('Connected to MongoDB');

    this.collections = {
      user_totals: this.db.collection('gaming_totals'),
      group_user_totals: this.db.collection('gaming_group_total'),
      top_global_groups: this.db.collection('gaming_global_groups'),
      pm_users: this.db.collection('gaming_pm_users'),
      destination: this.db.collection('gamimg_user_collection'),
      destination_char: this.db.collection('gaming_anime_characters')
    };

    await this.collections.destination_char.createIndex({ id: 1 });
    await this.collections.destination_char.createIndex({ anime: 1 });
    await this.collections.destination_char.createIndex({ img_url: 1 });
    await this.collections.destination.createIndex({ 'characters.id': 1 });
    await this.collections.destination.createIndex({ 'characters.name': 1 });
    await this.collections.destination.createIndex({ 'characters.img_url': 1 });
  }

  async loadModules() {
    const modulesDir = path.join(__dirname, 'modules');
    try {
      const files = await fs.readdir(modulesDir);
      for (const file of files) {
        if (file.endsWith('.js')) {
          const moduleName = path.basename(file, '.js');
          const modulePath = path.join(modulesDir, file);
          const moduleUrl = new URL(`file://${modulePath}`).href;
          const module = await import(moduleUrl);
          
          if (typeof module.default === 'function') {
            this.modules.set(moduleName, module.default);
            console.log(`Loaded module: ${moduleName}`);
          }
        }
      }
    } catch (error) {
      console.error('Error loading modules:', error);
    }
  }

  setupEventHandlers() {
    this.bot.on('message', (msg) => {
      this.handleMessage(msg);
    });

    this.bot.on('inline_query', async (query) => {
      await this.handleInlineQuery(query);
    });
  }

  async handleMessage(msg) {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (text && text.startsWith('/')) {
      const [command, ...args] = text.slice(1).split(' ');
      await this.handleCommand(command, args, msg);
    } else {
      await this.messageCounter(msg);
      this.modules.forEach((module) => {
        if (typeof module.onMessage === 'function') {
          module.onMessage(this.bot, this.collections, msg);
        }
      });
    }
  }

  async handleCommand(command, args, msg) {
    switch (command) {
      case 'guess':
      case 'protecc':
      case 'collect':
      case 'grab':
      case 'hunt':
        await this.guess(msg, args);
        break;
      case 'fav':
        await this.fav(msg, args);
        break;
      case 'uptime':
        await this.uptime(msg);
        break;
      case 'now':
        await this.now(msg, args);
        break;
      default:
        const module = this.modules.get(command);
        if (module) {
          await module(this.bot, this.collections, msg, args);
        } else {
          await this.bot.sendMessage(msg.chat.id, 'Unknown command');
        }
    }
  }

  async handleInlineQuery(query) {
    const inlineQueryModule = this.modules.get('inlinequery');
    if (inlineQueryModule) {
      try {
        const { results, nextOffset } = await inlineQueryModule(this.bot, this.collections, query);
        await this.bot.answerInlineQuery(query.id, results, {
          cache_time: 5,
          next_offset: nextOffset,
        });
      } catch (error) {
        console.error('Error handling inline query:', error);
      }
    }
  }

  async messageCounter(msg) {
    const chatId = msg.chat.id.toString();
    const userId = msg.from.id;

    if (msg.chat.type !== 'group' && msg.chat.type !== 'supergroup') {
      return;
    }

    if (!this.locks[chatId]) {
      this.locks[chatId] = new AsyncLock();
    }

    await this.locks[chatId].acquire('messageCounter', async () => {
      if (this.lastUser[chatId] && this.lastUser[chatId].userId === userId) {
        this.lastUser[chatId].count++;
        if (this.lastUser[chatId].count >= 10) {
          if (this.warnedUsers[userId] && Date.now() - this.warnedUsers[userId] < 600000) {
            return;
          } else {
            await this.bot.sendMessage(chatId, `⚠️ Don't Spam ${msg.from.first_name}...\nYour Messages Will be ignored for 10 Minutes...`);
            this.warnedUsers[userId] = Date.now();
            return;
          }
        }
      } else {
        this.lastUser[chatId] = { userId: userId, count: 1 };
      }

      if (!this.messageCounts[chatId]) {
        this.messageCounts[chatId] = { wordGame: 0, character: 0, mathGame: 0 };
      }

      this.messageCounts[chatId].wordGame++;
      this.messageCounts[chatId].character++;
      this.messageCounts[chatId].mathGame++;

      if (this.messageCounts[chatId].wordGame >= 75) {
        if (Math.random() < 0.5) {
          await this.startWordGame(msg);
        }
        this.messageCounts[chatId].wordGame = 0;
      }

      if (this.messageCounts[chatId].character >= 100) {
        await this.sendImage(msg);
        this.messageCounts[chatId].character = 0;
      }

      if (this.messageCounts[chatId].mathGame >= 75) {
        if (Math.random() < 0.5) {
          await this.startMathGame(msg);
        }
        this.messageCounts[chatId].mathGame = 0;
      }

      await this.updateUserStats(msg);
    });
  }

  async updateUserStats(msg) {
    const chatId = msg.chat.id.toString();
    const userId = msg.from.id;

    const user = await this.collections.destination.findOne({ id: userId });
    if (user) {
      const updateFields = {};
      if (msg.from.username && msg.from.username !== user.username) {
        updateFields.username = msg.from.username;
      }
      if (msg.from.first_name !== user.first_name) {
        updateFields.first_name = msg.from.first_name;
      }
      if (Object.keys(updateFields).length > 0) {
        await this.collections.destination.updateOne({ id: userId }, { $set: updateFields });
      }
    }

    await this.collections.group_user_totals.updateOne(
      { user_id: userId, group_id: chatId },
      {
        $set: {
          username: msg.from.username,
          first_name: msg.from.first_name
        },
        $inc: { count: 1 }
      },
      { upsert: true }
    );

    await this.collections.top_global_groups.updateOne(
      { group_id: chatId },
      {
        $set: { group_name: msg.chat.title },
        $inc: { count: 1 }
      },
      { upsert: true }
    );
  }

  async startMathGame(msg) {
    const chatId = msg.chat.id;
    const { problem, answer, level } = this.generateEquation();
    const img = await this.createEquationImage(problem);

    await this.bot.sendPhoto(chatId, img, { caption: "Solve this math problem!" });

    const gameData = { answer, level };
    this.bot.once('message', async (response) => {
      if (response.text.trim() === answer) {
        await this.bot.sendMessage(chatId, `Correct! The answer is ${answer}.`);
        await this.updateUserBalance(response.from.id, 40);
        await this.reactToMessage(chatId, response.message_id);
      } else {
        await this.bot.sendMessage(chatId, `Sorry, that's incorrect. The correct answer is ${answer}.`);
      }
    });
  }

  generateEquation(level = null) {
    if (level === null) {
      level = Math.floor(Math.random() * 4) + 1;
    }

    let num1, num2, operator, answer;

    switch (level) {
      case 1:
        num1 = Math.floor(Math.random() * 20) + 1;
        num2 = Math.floor(Math.random() * 20) + 1;
        operator = ['+', '-', 'x'][Math.floor(Math.random() * 3)];
        break;
      case 2:
        num1 = Math.floor(Math.random() * 50) + 1;
        num2 = Math.floor(Math.random() * 50) + 1;
        operator = ['+', '-', 'x', '/'][Math.floor(Math.random() * 4)];
        break;
      case 3:
        num1 = Math.floor(Math.random() * 100) + 1;
        num2 = Math.floor(Math.random() * 10) + 1;
        operator = ['+', '-', 'x', '/', '^'][Math.floor(Math.random() * 5)];
        break;
      case 4:
        num1 = Math.floor(Math.random() * 151) + 50;
        num2 = Math.floor(Math.random() * 20) + 1;
        operator = ['+', '-', 'x', '/', '^'][Math.floor(Math.random() * 5)];
        break;
    }

    switch (operator) {
      case '+':
        answer = num1 + num2;
        break;
      case '-':
        answer = num1 - num2;
        break;
      case 'x':
        answer = num1 * num2;
        break;
      case '/':
        num1 = num1 * num2;
        answer = num1 / num2;
        break;
      case '^':
        answer = Math.pow(num1, num2);
        break;
    }

    const problem = `${num1} ${operator} ${num2}`;
    return { problem, answer: answer.toString(), level };
  }

  async createEquationImage(equation) {
    const canvas = createCanvas(1060, 596);
    const ctx = canvas.getContext('2d');

    const backgroundImage = await loadImage('https://files.catbox.moe/rbz6no.jpg');
    ctx.drawImage(backgroundImage, 0, 0, 1060, 596);

    ctx.font = 'bold 80px DejaVu Sans';
    ctx.fillStyle = 'black';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(equation, 530, 298);

    return canvas.toBuffer();
  }

  async sendImage(msg) {
    const chatId = msg.chat.id;

    const allCharacters = await this.collections.destination_char.find({}).toArray();

    if (!this.sentCharacters[chatId]) {
      this.sentCharacters[chatId] = [];
    }

    if (this.sentCharacters[chatId].length === allCharacters.length) {
      this.sentCharacters[chatId] = [];
    }

    const availableCharacters = allCharacters.filter(c => 
      c.id && 
      !this.sentCharacters[chatId].includes(c.id) && 
      c.rarity && 
      c.rarity !== '💸 Premium Edition'
    );

    const rarityWeights = {
      "⚪️ Common": 12,
      "🟣 Rare": 0.2,
      "🟡 Legendary": 4.5,
      "🟢 Medium": 12,
      "💮 Special edition": 0.2,
      "🔮 Limited Edition": 0.1
    };

    const totalWeight = availableCharacters.reduce((sum, char) => sum + (rarityWeights[char.rarity] || 1), 0);
    let randomWeight = Math.random() * totalWeight;
    let selectedCharacter;

    for (const character of availableCharacters) {
      const weight = rarityWeights[character.rarity] || 1;
      if (randomWeight <= weight) {
        selectedCharacter = character;
        break;
      }
      randomWeight -= weight;
    }

    

    if (!selectedCharacter) {
      selectedCharacter = availableCharacters[Math.floor(Math.random() * availableCharacters.length)];
    }

    this.sentCharacters[chatId].push(selectedCharacter.id);
    this.lastCharacters[chatId] = selectedCharacter;

    delete this.firstCorrectGuesses[chatId];

    const characterCode = `#${Math.floor(Math.random() * 90000) + 10000}`;
    selectedCharacter.code = characterCode;

    const sentMessage = await this.bot.sendPhoto(
      chatId,
      selectedCharacter.img_url,
      {
        caption: `✨ A Wild ${selectedCharacter.rarity} Character Appeared! ✨\n\n🔍 Use /guess to identify and add this mysterious character to your Harem!\n💫 Quick, before someone else claims them!`,
        parse_mode: 'Markdown'
      }
    );

    this.lastCharacters[chatId].message_id = sentMessage.message_id;
  }

  async reactToMessage(chatId, messageId) {
    const randomEmoji = this.emojis[Math.floor(Math.random() * this.emojis.length)];
    
    try {
      await this.bot.setMessageReaction(chatId, messageId, [{ type: 'emoji', emoji: randomEmoji }]);
      console.log("Reaction set successfully!");
    } catch (error) {
      console.error(`Failed to set reaction. Error: ${error.message}`);
    }
  }

  async guess(msg, args) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!this.lastCharacters[chatId]) {
      return;
    }

    if (this.firstCorrectGuesses[chatId]) {
      await this.bot.sendMessage(chatId, `❌ Oops! Someone already guessed this character. Better luck next time, adventurer! 🍀`);
      return;
    }

    const guess = args.join(' ').toLowerCase();
    
    if (guess.includes('()') || guess.toLowerCase().includes('&')) {
      await this.bot.sendMessage(chatId, "Nahh You Can't use This Types of words in your guess..❌️");
      return;
    }

    const nameParts = this.lastCharacters[chatId].name.toLowerCase().split(' ');

    if (nameParts.sort().join(' ') === guess.split(' ').sort().join(' ') || nameParts.some(part => part === guess)) {
      this.firstCorrectGuesses[chatId] = userId;
      
      await this.collections.destination.updateOne(
        { id: userId },
        { 
          $set: { 
            username: msg.from.username,
            first_name: msg.from.first_name
          },
          $push: { characters: this.lastCharacters[chatId] }
        },
        { upsert: true }
      );

      await this.reactToMessage(chatId, msg.message_id);

      await this.updateUserBalance(userId, 40);

      const user = await this.collections.destination.findOne({ id: userId });
      const newBalance = user ? (user.balance || 0) + 40 : 40;

      await this.bot.sendMessage(
        chatId,
        `🎉 Congratulations! You have earned 40 coins for guessing correctly! \nYour new balance is ${newBalance} coins.`
      );

      await this.collections.group_user_totals.updateOne(
        { user_id: userId, group_id: chatId },
        {
          $set: {
            username: msg.from.username,
            first_name: msg.from.first_name
          },
          $inc: { count: 1 }
        },
        { upsert: true }
      );

      await this.collections.top_global_groups.updateOne(
        { group_id: chatId },
        {
          $set: { group_name: msg.chat.title },
          $inc: { count: 1 }
        },
        { upsert: true }
      );

      const keyboard = {
        inline_keyboard: [[{ text: "See Harem", switch_inline_query_current_chat: `collection.${userId}` }]]
      };

      await this.bot.sendMessage(
        chatId,
        `🌟 <b><a href="tg://user?id=${userId}">${this.escapeHTML(msg.from.first_name)}</a></b>, you've captured a new character! 🎊\n\n` +
        `📛 𝗡𝗔𝗠𝗘: <b>${this.lastCharacters[chatId].name}</b> \n` +
        `🌈 𝗔𝗡𝗜𝗠𝗘: <b>${this.lastCharacters[chatId].anime}</b> \n` +
        `✨ 𝗥𝗔𝗥𝗜𝗧𝗬: <b>${this.lastCharacters[chatId].rarity}</b>\n\n` +
        'This magical being has been added to your harem. Use /harem to view your growing collection!',
        {
          parse_mode: 'HTML',
          reply_markup: keyboard
        }
      );
    } else {
      await this.bot.sendMessage(chatId, '❌ Not quite right, brave guesser! Try again and unveil the mystery character! 🕵️‍♂️');
    }
  }

  async fav(msg, args) {
    const userId = msg.from.id;

    if (!args.length) {
      await this.bot.sendMessage(msg.chat.id, 'Please provide Character id...');
      return;
    }

    const characterId = args[0];

    const user = await this.collections.destination.findOne({ id: userId });
    if (!user) {
      await this.bot.sendMessage(msg.chat.id, 'You have not Guessed any characters yet....');
      return;
    }

    const character = user.characters.find(c => c.id === characterId);
    if (!character) {
      await this.bot.sendMessage(msg.chat.id, 'This Character is Not In your collection');
      return;
    }

    await this.collections.destination.updateOne(
      { id: userId },
      { $set: { favorites: [characterId] } }
    );

    await this.bot.sendMessage(msg.chat.id, `Character ${character.name} has been added to your favorite...`);
  }

  async uptime(msg) {
    const chatId = msg.chat.id;
    
    await this.bot.sendMessage(
      chatId,
      "Starting uptime check... The bot will send a message every minute to indicate its status."
    );

    this.setupScheduler();
  }

  async now(msg, args) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    if (userId !== OWNER_ID) {
      await this.bot.sendMessage(chatId, "You are not authorized to use this command.");
      return;
    }
    
    if (!args.length) {
      await this.bot.sendMessage(chatId, "Usage: /now {word|character|math}");
      return;
    }
    
    const gameType = args[0].toLowerCase();
    
    switch (gameType) {
      case 'word':
        await this.startWordGame(msg);
        break;
      case 'character':
        await this.sendImage(msg);
        break;
      case 'math':
        await this.startMathGame(msg);
        break;
      default:
        await this.bot.sendMessage(chatId, "Invalid game type. Use 'word', 'character', or 'math'.");
    }
  }

  setupScheduler() {
    schedule.scheduleJob('*/1 * * * *', async () => {
      await this.checkUptime();
    });
  }

  async checkUptime() {
    try {
      const response = await axios.get('https://firsetryp.onrender.com');
      const message = response.status === 200 ? "Your bot is UP!" : `Your bot is DOWN with status code ${response.status}`;
      await this.bot.sendMessage(CHAT_ID, message);
    } catch (error) {
      console.error('Error checking uptime:', error);
      await this.bot.sendMessage(CHAT_ID, `Error checking Your bot: ${error.message}`);
    }
  }

  async startWordGame(msg) {
    const chatId = msg.chat.id;
    
    const word = this.words[Math.floor(Math.random() * this.words.length)];
    const img = await this.createWordImage(word);
    
    await this.bot.sendPhoto(
      chatId,
      img,
      { caption: "A new word has appeared! Can you guess what it is?" }
    );
    
    this.bot.once('message', async (response) => {
      if (response.text.toLowerCase().trim() === word) {
        await this.bot.sendMessage(chatId, `Correct! The word is "${word}".`);
        await this.updateUserBalance(response.from.id, 40);
        await this.reactToMessage(chatId, response.message_id);
      } else {
        await this.bot.sendMessage(chatId, `Sorry, that's incorrect. The correct word was "${word}".`);
      }
    });
  }

  createHiddenWord(word) {
    if (word.length <= 4) {
      return `${word[0]}${'_ '.repeat(word.length - 2)}${word[word.length - 1]}`;
    } else if (word.length <= 6) {
      const middle = Math.floor(word.length / 2);
      return `${word[0]}${'_ '.repeat(middle - 1)}${word[middle]}${'_ '.repeat(word.length - middle - 2)}${word[word.length - 1]}`;
    } else {
      const third = Math.floor(word.length / 3);
      const twoThirds = 2 * third;
      return `${word[0]}${'_ '.repeat(third - 1)}${word[third]}${'_ '.repeat(third - 1)}${word[twoThirds]}${'_ '.repeat(word.length - twoThirds - 2)}${word[word.length - 1]}`;
    }
  }

  async createWordImage(word) {
    const canvas = createCanvas(1060, 596);
    const ctx = canvas.getContext('2d');

    const backgroundImage = await loadImage('https://files.catbox.moe/rbz6no.jpg');
    ctx.drawImage(backgroundImage, 0, 0, 1060, 596);

    ctx.font = 'bold 80px DejaVu Sans';
    ctx.fillStyle = 'black';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const hiddenWord = this.createHiddenWord(word);
    ctx.fillText(hiddenWord, 530, 298);

    return canvas.toBuffer();
  }

  async updateUserBalance(userId, amount) {
    await this.collections.destination.updateOne(
      { id: userId },
      { $inc: { balance: amount } },
      { upsert: true }
    );
  }

  escapeHTML(text) {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  async close() {
    if (this.mongoClient) {
      await this.mongoClient.close();
      console.log('Closed MongoDB connection');
    }
  }
}
