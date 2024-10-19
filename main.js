import { config } from 'dotenv';
import { Bot } from './bot.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

config(); // Load environment variables

const TOKEN = process.env.BOT_TOKEN;
const MONGO_URL = process.env.MONGO_URL;

if (!TOKEN || !MONGO_URL) {
  console.error('Missing BOT_TOKEN or MONGO_URL in environment variables');
  process.exit(1);
}

const lockFile = path.join(__dirname, 'bot.lock');

function acquireLock() {
  try {
    fs.writeFileSync(lockFile, 'locked', { flag: 'wx' });
    return true;
  } catch (err) {
    return false;
  }
}

function releaseLock() {
  try {
    fs.unlinkSync(lockFile);
  } catch (err) {
    console.error('Error releasing lock:', err);
  }
}

if (!acquireLock()) {
  console.error('Another instance of the bot is already running.');
  process.exit(1);
}

const bot = new Bot(TOKEN, MONGO_URL);

bot.start().then(() => {
  console.log('Bot started successfully');
}).catch((error) => {
  console.error('Failed to start bot:', error);
});

// Handle application shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down...');
  await bot.close();
  releaseLock();
  process.exit(0);
});

process.on('exit', releaseLock);

// This function is not needed for Node.js environment, but kept for consistency
export default function Component() {
  return null;
}