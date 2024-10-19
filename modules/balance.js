export default async function balance(bot, db, msg, args) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
  
    const userCollection = db.collection('users');
    const user = await userCollection.findOne({ id: userId });
  
    if (user) {
      const balance = user.balance || 0;
      bot.sendMessage(chatId, `Your current balance is: ${balance} coins.`);
    } else {
      bot.sendMessage(chatId, "You don't have an account yet. Start playing to create one!");
    }
  }
  
  balance.onMessage = function(bot, db, msg) {
    // Handle non-command messages if needed
  };