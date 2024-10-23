const { Markup } = require('telegraf');
const { escape } = require('html-entities');
const random = require('random');
const axios = require('axios');
const { BOT_USERNAME, SUPPORT_CHAT, UPDATE_CHAT, GROUP_ID, PHOTO_URL } = process.env;

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

    // Step 1: Starting message
    await ctx.reply("🚀...");

    // Step 2: Checking message
    const checkMsg = await ctx.reply("🔍...");

    // Step 3: Check if user exists in MongoDB
    let userData = await destinationCollection.findOne({ _id: userId });

    if (!userData) {
        // Step 4: Update message
        await checkMsg.editText("✨...");

        // Download and upload profile photo
        const profilePhoto = await downloadProfilePhoto(ctx, userId);
        const profileLink = profilePhoto ? profilePhoto : "No profile photo available";

        // Insert new user data
        await destinationCollection.insertOne({
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
            await userCollection.updateOne(
                { _id: userId },
                { $set: { first_name: firstName, username: username } }
            );
        }
    }

    // Step 5: Complete message
    await checkMsg.editText("🌟");

    // Final step: Send the main message
    const photoUrl = random.choice(PHOTO_URL);
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.url("🎭 ADD ME TO YOUR GROUP 🎭", `http://t.me/${BOT_USERNAME}?startgroup=new`)],
        [Markup.button.url("💬 SUPPORT", `https://t.me/${SUPPORT_CHAT}`),
         Markup.button.url("📢 UPDATES", `https://t.me/${UPDATE_CHAT}`)]
    ]);

    await ctx.telegram.sendPhoto(
        ctx.chat.id,
        photoUrl,
        {
            caption: `
🎮 ***Welcome to Epic Arena!***

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

Let's make your group the ultimate gaming hub! 🚀
            `,
            reply_markup: keyboard
        }
    );
};

module.exports = {
    start,
};

