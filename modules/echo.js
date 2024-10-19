export default function echo(bot, db, msg, args) {
    const chatId = msg.chat.id;
    const text = args.join(' ');
  
    if (text) {
      bot.sendMessage(chatId, text);
    } else {
      bot.sendMessage(chatId, 'Please provide some text to echo.');
    }
  }
  
  echo.onMessage = function(bot, db, msg) {
    // Handle non-command messages if needed
  };