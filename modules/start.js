const { Markup } = require('telegraf');
const { escape } = require('html-entities');
const axios = require('axios');
const fs = require('fs');

const PHOTO_URL = 'https://envs.sh/A2J.jpg'; // img

const SUPPORT_CHAT = '+IT7AiU48nBUyYjg1'
const UPDATE_CHAT = '+IT7AiU48nBUyYjg1'
const BOT_USERNAME = 'EpicArenaBot'
// Upload file to Catbox
const uploadToCatbox = async (filePath) => {
    const url = "https://catbox.moe/user/api.php";
    try {
        const response = await axios.post(url, {
            reqtype: "fileupload",
            fileToUpload: fs.createReadStream(filePath)
        });
        if (response.data.startsWith("https")) {
            return response.data;
        } else {
            throw new Error(`Error uploading to Catbox: ${response.data}`);
        }
    } catch (error) {
        console.error(`Catbox upload failed: ${error.message}`);
        return null;
    }
};

// Download user's profile photo
const downloadProfilePhoto = async (ctx, userId) => {
    try {
        const user = await ctx.telegram.getUserProfilePhotos(userId);
        if (user.photos && user.photos.length > 0) {
            const fileId = user.photos[0][user.photos[0].length - 1].file_id;
            const filePath = await ctx.telegram.getFileLink(fileId);
            return uploadToCatbox(filePath);
        } else {
            console.log("No profile photo available.");
            return null;
        }
    } catch (error) {
        console.error(`Error downloading profile photo: ${error.message}`);
        return null;
    }
};

// Start command handler
const start = async (ctx) => {
    const user = ctx.from;
    const userId = user.id;
    const firstName = user.first_name;
    const username = user.username;

    try {
        // Step 1: Starting message
        await ctx.reply("🚀...");

        // Step 2: Checking message
        const checkMsg = await ctx.telegram.sendMessage(ctx.chat.id, "🔍");

        // Step 3: Check if user exists in MongoDB
        let userData = await ctx.db.destinationCollection.findOne({ _id: userId });

        if (!userData) {
            // Step 4: Update message
            await ctx.telegram.editMessageText(checkMsg.chat.id, checkMsg.message_id, null, "✨");

            // Download and upload profile photo
            const profilePhoto = await downloadProfilePhoto(ctx, userId);
            const profileLink = profilePhoto ? profilePhoto : "No profile photo available";

            // Insert new user data
            await ctx.db.destinationCollection.insertOne({
                _id: userId,
                first_name: firstName,
                username: username,
                profile_link: profileLink
            });

            await ctx.telegram.sendMessage(
                GROUP_ID,
                `🎉 New adventurer joined the quest!\nUser: <a href='tg://user?id=${userId}'>${escape(firstName)}</a>`,
                { parse_mode: 'HTML' }
            );
        } else {
            // Update existing user data if necessary
            if (userData.first_name !== firstName || userData.username !== username) {
                await ctx.db.destinationCollection.updateOne(
                    { _id: userId },
                    { $set: { first_name: firstName, username: username } }
                );
            }
        }

        // Step 5: Complete message
        await ctx.telegram.editMessageText(checkMsg.chat.id, checkMsg.message_id, null, "🌟");

    const url_button1 = Markup.button.url("🎭 ADD ME TO YOUR GROUP 🎭", `http://t.me/${BOT_USERNAME}?startgroup=new`);
    const url_button2 = Markup.button.url("💬 SUPPORT", `https://t.me/${SUPPORT_CHAT}`);
    const url_button3 = Markup.button.url("📢 UPDATES", `https://t.me/${UPDATE_CHAT}`);

    // Create the inline keyboard
let keyboard = Markup.inlineKeyboard([
    [url_button1], // First row with one button
    [url_button2, url_button3] // Second row with two buttons
]);

keyboard = [[url_button1],
            [url_button2, url_button3]];

const reply_markup = { inline_keyboard: keyboard }; // Make sure to construct this correctly

        // Send photo with caption and inline keyboard
        await ctx.telegram.sendPhoto(ctx.chat.id, PHOTO_URL, {
            caption: `🎮 ***Welcome to Epic Arena!***

Hey Adventurer! 👋 Ready for a thrilling quest?

🤖 I'm your Game Master Bot, and here's your mission:

1️⃣ Add me to your group
2️⃣ Play three exciting games:
   - 📝 Word Game
   - ➕ Math Game
   - 🎯 Character Guess (random characters appear every 100 messages)
3️⃣ Catch characters using /guess!
4️⃣ Build your dream team with /harem

🏆 Compete, collect, and rise to the top!

Let's make your group the ultimate gaming hub! 🚀`,
            reply_markup: reply_markup // Make sure to use reply_markup
        });
    } catch (error) {
        console.error(`Error in start command: ${error.message}`);
        await ctx.reply("An error occurred while processing your request.");
    }
};

module.exports = {
    start,
};
