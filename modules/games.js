// import { createWordImage, createEquationImage } from '../utils/imageUtils.js';
// import { generateEquation, weightedRandomSelect, RARITY_WEIGHTS } from '../utils/gameUtils.js';

// export default async function games(bot, db, msg, args) {
//   const chatId = msg.chat.id;
//   const command = args[0];

//   switch (command) {
//     case 'math':
//       await startMathGame(bot, db, chatId);
//       break;
//     case 'word':
//       await startWordGame(bot, db, chatId);
//       break;
//     case 'character':
//       await sendCharacterImage(bot, db, chatId);
//       break;
//     default:
//       bot.sendMessage(chatId, 'Available games: math, word, character');
//   }
// }

// async function startMathGame(bot, db, chatId) {
//   const { problem, answer } = generateEquation();
//   const imageBuffer = await createEquationImage(problem);

//   await bot.sendPhoto(chatId, imageBuffer, { caption: 'Solve this math problem!' });
  
//   const gameCollection = db.collection('active_games');
//   await gameCollection.updateOne(
//     { chatId, gameType: 'math' },
//     { $set: { answer, startTime: new Date() } },
//     { upsert: true }
//   );
// }

// async function startWordGame(bot, db, chatId) {
//   const words = ['javascript', 'telegram', 'bot', 'mongodb', 'nodejs'];
//   const word = words[Math.floor(Math.random() * words.length)];
//   const imageBuffer = await createWordImage(word);

//   await bot.sendPhoto(chatId, imageBuffer, { caption: 'Guess the word!' });

//   const gameCollection = db.collection('active_games');
//   await gameCollection.updateOne(
//     { chatId, gameType: 'word' },
//     { $set: { answer: word, startTime: new Date() } },
//     { upsert: true }
//   );
// }

// async function sendCharacterImage(bot, db, chatId) {
//   const charactersCollection = db.collection('characters');
//   const characters = await charactersCollection.find().toArray();
//   const selectedCharacter = weightedRandomSelect(characters, RARITY_WEIGHTS);

//   await bot.sendPhoto(chatId, selectedCharacter.img_url, {
//     caption: `✨ A Wild ${selectedCharacter.rarity} Character Appeared! ✨\n\n🔍 Use /guess to identify this character!`
//   });

//   const gameCollection = db.collection('active_games');
//   await gameCollection.updateOne(
//     { chatId, gameType: 'character' },
//     { $set: { answer: selectedCharacter.name, startTime: new Date() } },
//     { upsert: true }
//   );
// }

// games.onMessage = async function(bot, db, msg) {
//   const chatId = msg.chat.id;
//   const text = msg.text;

//   const gameCollection = db.collection('active_games');
//   const activeGame = await gameCollection.findOne({ chatId });

//   if (activeGame) {
//     if (text.toLowerCase() === activeGame.answer.toLowerCase()) {
//       bot.sendMessage(chatId, 'Correct! You won the game!');
//       await gameCollection.deleteOne({ chatId });
//     }
//   }
// };