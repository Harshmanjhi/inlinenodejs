const { Markup } = require('telegraf');
const Cache = require('node-cache');
const escapeHtml = require('escape-html');

const allCharactersCache = new Cache({ stdTTL: 36000 });
const userCollectionCache = new Cache({ stdTTL: 60 });

// Inline query handler
const inlineQuery = async (ctx) => {
    try {
        const query = ctx.inlineQuery.query;
        const offset = ctx.inlineQuery.offset ? parseInt(ctx.inlineQuery.offset) : 0;
        let allCharacters = [];
        let user = null;
    
        // Process the query based on user collection or general character search
        if (query.startsWith('collection.')) {
            const [userId, ...searchTerms] = query.split(' ')[0].split('.').slice(1);
            const searchQuery = searchTerms.join(' ');
    
            if (!isNaN(userId)) {
                user = userCollectionCache.get(userId);
    
                if (!user) {
                    user = await ctx.db.destinationCollection.findOne({ id: parseInt(userId) });
                    if (user) {
                        userCollectionCache.set(userId, user);
                    }
                }
    
                if (user) {
                    allCharacters = Array.from(new Set(user.characters.map(v => v.id)))
                        .map(id => user.characters.find(v => v.id === id));
    
                    if (searchQuery) {
                        const regexSearch = new RegExp(searchQuery, 'i');
                        allCharacters = allCharacters.filter(character => regexSearch.test(character.name) || regexSearch.test(character.anime));
                    }
                }
            }
        } else {
            const regexSearch = new RegExp(query, 'i');
            allCharacters = await ctx.db.destinationCharCollection.find({
                $or: [{ name: regexSearch }, { anime: regexSearch }]
            }).toArray();
        }
    
        // If no characters found, fetch from cache or database
        if (allCharacters.length === 0) {
            allCharacters = allCharactersCache.get('all_characters') || await ctx.db.destinationCharCollection.find({}).toArray();
            allCharactersCache.set('all_characters', allCharacters);
        }
    
        // Prepare the characters for response
        const characters = allCharacters.slice(offset, offset + 10);
        const nextOffset = characters.length === 10 ? (offset + 10).toString() : '';
    
        const results = characters.map(character => {
            let caption;
    
            if (query.startsWith('collection.') && user) {
                const userCharacterCount = user.characters.filter(c => c.id === character.id).length;
                const userAnimeCharacters = user.characters.filter(c => c.anime === character.anime).length;
    
                caption = `
<b>🌟 Look At <a href='tg://user?id=${user.id}'>${escapeHtml(user.first_name || user.id.toString())}</a>'s Character 🌟</b>\n
🌸: <b>${character.name} (x${userCharacterCount})</b>\n
🏖️: <b>${character.anime} (${userAnimeCharacters}/${character.animeCount || 'N/A'})</b>\n
<b>${character.rarity}</b>\n
<b>🆔️:</b> ${character.id}
                `;
            } else {
                caption = `
<b>🌈 Look At This Character!! 🌈</b>\n
🌸: <b>${character.name}</b>\n
🏖️: <b>${character.anime}</b>\n
<b>${character.rarity}</b>\n
🆔️: <b>${character.id}</b>\n
<b>🔍 Globally Guessed: ${character.globalCount || 0} Times...</b>
                `;
            }
    
            return {
                type: 'photo',
                id: `${character.id}_${Date.now()}`,
                photo_url: character.img_url,
                thumb_url: character.img_url,
                caption: caption,
                parse_mode: 'HTML'
            };
        });
    
        await ctx.answerInlineQuery(results, { next_offset: nextOffset, cache_time: 5 });
    } catch (error) {
        await ctx.answerInlineQuery([], { cache_time: 5 }); // Respond with empty results in case of error
    }
};

// Export the inline query handler
module.exports = {
    inlineQuery,
};
