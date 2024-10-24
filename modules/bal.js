const { Telegraf } = require('telegraf');

async function balance(ctx) {
    const userId = ctx.from.id;

    // Retrieve user balance from the database
    const userBalance = await ctx.db.destinationCollection.findOne({ id: userId }, { projection: { balance: 1 } });

    if (userBalance) {
        const balanceAmount = userBalance.balance || 0;
        const balanceMessage = `💰 Yᴏᴜʀ ᴄᴜʀʀᴇɴᴛ ʙᴀʟᴀɴᴄᴇ ɪs: ${balanceAmount} coins.`;
        await ctx.reply(balanceMessage);
    } else {
        await ctx.reply("⚠️ Unable to retrieve your balance.");
    }
}

async function pay(ctx) {
    const senderId = ctx.from.id;

    // Check if the command was a reply
    if (!ctx.message.reply_to_message) {
        await ctx.reply("⚠️ Please reply to a message to use /pay.");
        return;
    }

    // Extract the recipient's user ID and first name
    const recipientId = ctx.message.reply_to_message.from.id;
    const recipientFirstName = ctx.message.reply_to_message.from.first_name;

    // Parse the amount from the command
    const amount = parseInt(ctx.message.text.split(' ')[1]);
    if (isNaN(amount)) {
        await ctx.reply("❌ Invalid amount. Usage: /pay <amount>");
        return;
    }

    // Check if the sender has enough balance
    const senderBalance = await ctx.db.destinationCollection.findOne({ id: senderId }, { projection: { balance: 1 } });
    if (!senderBalance || (senderBalance.balance || 0) < amount) {
        await ctx.reply("💸 Insufficient balance to make the payment.");
        return;
    }

    // Perform the payment
    await ctx.db.destinationCollection.updateOne({ id: senderId }, { $inc: { balance: -amount } });
    await ctx.db.destinationCollection.updateOne({ id: recipientId }, { $inc: { balance: amount } });

    // Fetch updated sender balance
    const updatedSenderBalance = await ctx.db.destinationCollection.findOne({ id: senderId }, { projection: { balance: 1 } });

    // Payment success message mentioning the recipient using their first name and Telegram ID
    await ctx.replyWithMarkdown(`✅ Payment successful! You paid ${amount} coins to [${recipientFirstName}](tg://user?id=${recipientId}). Yᴏᴜʀ ᴄᴜʀʀᴇɴᴛ ʙᴀʟᴀɴᴄᴇ: ${updatedSenderBalance.balance || 0} coins.`);
    
    // Notify the recipient
    await ctx.telegram.sendMessage(recipientId, `💵 You've received ${amount} coins from [${ctx.from.first_name}](tg://user?id=${senderId}).`, { parse_mode: 'Markdown' });
}

async function mtop(ctx) {
    // Retrieve the top 10 users with the highest balance
    const topUsers = await ctx.db.destinationCollection.find({}, { projection: { id: 1, first_name: 1, last_name: 1, balance: 1 } }).sort({ balance: -1 }).limit(10).toArray();

    // Create a message with the top users
    let topUsersMessage = "🏆 **Top 10 Users with Highest Balance:**\n\n";
    topUsers.forEach((user, index) => {
        const firstName = user.first_name || 'Unknown';
        const lastName = user.last_name || '';
        const userId = user.id || 'Unknown';

        // Concatenate first_name and last_name if last_name is available
        const fullName = lastName ? `${firstName} ${lastName}` : firstName;

        topUsersMessage += `${index + 1}. [${fullName}](tg://user?id=${userId}), \n **Balance:** ${user.balance || 0} coins\n\n`;
    });

    // Send the photo with the top users message
    const photoPath = 'https://telegra.ph/file/8fce79d744297133b79b6.jpg';
    await ctx.replyWithPhoto({ url: photoPath }, { caption: topUsersMessage, parse_mode: 'Markdown' });
}

async function dailyReward(ctx) {
    const userId = ctx.from.id;

    // Check if the user already claimed the daily reward today
    const userData = await ctx.db.destinationCollection.findOne({ id: userId }, { projection: { last_daily_reward: 1, balance: 1 } });

    if (userData) {
        const lastClaimedDate = userData.last_daily_reward;

        if (lastClaimedDate && lastClaimedDate.toDateString() === new Date().toDateString()) {
            await ctx.reply("🕒 You've already claimed your daily reward today. Come back tomorrow!");
            return;
        }
    }

    // Grant the daily reward
    await ctx.db.destinationCollection.updateOne(
        { id: userId },
        { $inc: { balance: 100 }, $set: { last_daily_reward: new Date() } }
    );

    await ctx.reply("🎉 Congratulations! You've claimed your daily reward of 100 coins. 💰");
}

// Export the inline query handler
module.exports = {
  balance,
  dailyReward, 
  pay,
  mtop
};

