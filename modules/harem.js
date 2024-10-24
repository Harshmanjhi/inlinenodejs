const { Markup } = require('telegraf');
const { escape } = require('html-escaper');

// Dictionary mapping rarity to emojis
const RARITY_EMOJIS = {
    '⚪ Common': '⚪',
    '🟡 Legendary': '🟡',
    '🟢 Medium': '🟢',
    '🟣 Rare': '🟣',
    '💮 Special edition': '💮',
    '🔮 Limited Edition': '🔮',
    '💸 Premium Edition': '💸',
};

async function harem(ctx, page = 0) {
    // console.log("Harem function called with page:", page);  // Log when the function is called

    const user_id = ctx.from.id;
    const CHARS_PER_PAGE = 10;

    try {
        const user = await ctx.db.destinationCollection.findOne({ id: user_id }, { characters: 1, favorites: 1 });
        // console.log("User found in DB:", user);  // Log user data

        if (!user || !user.characters || user.characters.length === 0) {
            const message = "🌟 Your magical harem is empty! Start your adventure by guessing characters! 🎭";
            await ctx.reply(message);
            return;
        }

        const characters = user.characters.sort((a, b) => (a.anime === b.anime ? a.id.localeCompare(b.id) : a.anime.localeCompare(b.anime)));
        const character_ids = characters.map(char => char.id);
        const character_counts = {};
        characters.forEach(char => {
            character_counts[char.id] = (character_counts[char.id] || 0) + 1;
        });

        const db_characters = await ctx.db.collection.find({ id: { $in: character_ids } }, { id: 1, rarity: 1, anime: 1, name: 1 }).toArray();
        const db_character_dict = Object.fromEntries(db_characters.map(char => [char.id, char]));

        const total_pages = Math.ceil(characters.length / CHARS_PER_PAGE);
        page = Math.max(0, Math.min(page, total_pages - 1));

        let harem_message = `✨ <b>${escape(ctx.from.first_name)}'s Magical Harem</b> ✨\n`;
        harem_message += `📚 Page ${page + 1}/${total_pages}\n\n`;

        const start_index = page * CHARS_PER_PAGE;
        const end_index = Math.min(start_index + CHARS_PER_PAGE, characters.length);

        for (let i = start_index; i < end_index; i++) {
            const current_character = characters[i];
            const character_id = current_character.id;
            const db_character = db_character_dict[character_id];

            if (db_character) {
                const rarity = db_character.rarity || 'Unknown Rarity';
                const rarity_emoji = RARITY_EMOJIS[rarity] || '❓';
                const count = character_counts[character_id];
                harem_message += `🆔 ID: ${character_id}\n`;
                harem_message += `✨ RARITY: [${rarity_emoji}] ${rarity}\n`;
                harem_message += `👤 CHARACTER: ${current_character.name} × ${count}\n`;
                harem_message += `🌈 ANIME: ${db_character.anime}\n\n`;
            } else {
                const count = character_counts[character_id];
                harem_message += `🔮 ${character_id} (Unknown Rarity) ${current_character.name} × ${count}\n\n`;
            }
        }

        const total_count = characters.length;

        const keyboard = [];

        // console.log("Total Pages:", total_pages, "Current Page:", page); // Log the total and current page

        keyboard.push([Markup.button.switchToCurrentChat(`🎭 See Full Collection (${total_count})`, `collection.${user_id}`)]);


        const reply_markup = Markup.inlineKeyboard(keyboard);
        // console.log("Generated keyboard:", keyboard);  // Log the generated keyboard

        let photo, caption;
        if (user.favorites && user.favorites.length > 0) {
            const fav_character_id = user.favorites[0];
            const fav_character = characters.find(c => c.id === fav_character_id);

            if (fav_character && fav_character.img_url) {
                photo = fav_character.img_url;
                caption = `💖 Your favorite character is leading your harem! 💖\n\n${harem_message}`;
            } else {
                photo = null;
                caption = `💖 Your favorite character is camera-shy today! 🙈\n\n${harem_message}`;
            }
        } else {
            const random_character = characters[Math.floor(Math.random() * characters.length)];
            if (random_character.img_url) {
                photo = random_character.img_url;
                caption = `✨ A random character from your harem appears! ✨\n\n${harem_message}`;
            } else {
                photo = null;
                caption = `🎭 Your characters are playing hide and seek! 🕵️‍♂️\n\n${harem_message}`;
            }
        }

        if (photo) {
            await ctx.replyWithPhoto(photo, {
                ...reply_markup,
                caption: caption,
                parse_mode: 'HTML'
            });
        } else {
            await ctx.reply(caption, {
                ...reply_markup,
                parse_mode: 'HTML'
            });
        }

    } catch (e) {
        // console.error(`Error in harem function: ${e}`);
        await ctx.reply("🚨 Something went wrong while fetching your harem! Please try again later.");
    }
}

async function haremCallback(ctx) {
    // Ensure that the match data exists
    if (!ctx.match || !ctx.match[0]) {
        // console.error("Callback data is missing or incorrect:", ctx.match);
        await ctx.reply("🚨 Invalid callback data received. Please try again.");
        return;
    }

    // Log the callback data for debugging
    // console.log("haremCallback triggered with data:", ctx.match[0]);

    // Split the correct callback data (ctx.match[0])
    const [_, page, user_id] = ctx.match[0].split(':'); // Use ctx.match[0] instead of ctx.match[1]

    // Ensure the page and user_id are correctly parsed
    const pageNum = parseInt(page);
    const userId = parseInt(user_id);

    // Ensure that the callback is from the correct user
    if (ctx.from.id !== userId) {
        await ctx.answerCbQuery("🚫 Oops! This magical harem belongs to someone else. Start your own adventure! 🧙‍♂️", { show_alert: true });
        return;
    }

    // Call the harem function with the correct page number
    await harem(ctx, pageNum);
}

module.exports = {
    harem,
    haremCallback
};
