// modules/inlinequery.js
import pkg from 'node-telegram-bot-api'; // Import package
const { InlineQueryResultPhoto } = pkg; // Destructure InlineQueryResultPhoto
import { TTLCache } from '@brokerloop/ttlcache';

// Define TTL caches
const all_characters_cache = new TTLCache({ maxSize: 10000, ttl: 36000 }); // 10 hours
const user_collection_cache = new TTLCache({ maxSize: 10000, ttl: 60 }); // 60 seconds

export default async function handleInlineQuery(bot, collections, query) {
    const searchTerm = query.query;
    const offset = parseInt(query.offset) || 0;

    let all_characters;

    if (searchTerm.startsWith('collection.')) {
        const [, userId, ...searchTerms] = searchTerm.split('.');
        const terms = searchTerms.join(' ');

        // Fetch user from cache or database
        let user = user_collection_cache.get(userId);
        if (!user) {
            user = await collections.destination.findOne({ id: parseInt(userId) });
            if (user) user_collection_cache.set(userId, user);
        }

        if (user) {
            all_characters = Array.from(new Set(user.characters.map(c => c.id)))
                .map(id => user.characters.find(c => c.id === id));

            if (terms) {
                const regex = new RegExp(terms, 'i');
                all_characters = all_characters.filter(c => regex.test(c.name) || regex.test(c.anime));
            }
        } else {
            all_characters = [];
        }
    } else {
        if (searchTerm) {
            const regex = new RegExp(searchTerm, 'i');
            all_characters = await collections.destination_char.find({
                $or: [{ name: regex }, { anime: regex }]
            }).toArray();
        } else {
            // If no search term, check cache
            if (all_characters_cache.has('all_characters')) {
                all_characters = all_characters_cache.get('all_characters');
            } else {
                all_characters = await collections.destination_char.find({}).toArray();
                all_characters_cache.set('all_characters', all_characters);
            }
        }
    }

    const characters = all_characters.slice(offset, offset + 10);
    const nextOffset = characters.length > 10 ? (offset + 10).toString() : null;

    const results = await Promise.all(characters.map(async (character) => {
        const globalCount = await collections.destination.countDocuments({ 'characters.id': character.id });
        const animeCharacters = await collections.destination_char.countDocuments({ anime: character.anime });

        let caption;
        if (searchTerm.startsWith('collection.')) {
            const userCharacterCount = user.characters.filter(c => c.id === character.id).length;
            const userAnimeCharacters = user.characters.filter(c => c.anime === character.anime).length;

            caption = `
                <b>🌟 Look At <a href="tg://user?id=${user.id}">${escapeHtml(user.first_name || user.id.toString())}</a>'s Character 🌟</b>
                🌸: <b>${character.name} (x${userCharacterCount})</b>
                🏖️: <b>${character.anime} (${userAnimeCharacters}/${animeCharacters})</b>
                <b>${character.rarity}</b>
                <b>🆔️:</b> ${character.id}
            `;
        } else {
            caption = `
                <b>🌈 Look At This Character!! 🌈</b>
                🌸: <b>${character.name}</b>
                🏖️: <b>${character.anime}</b>
                <b>${character.rarity}</b>
                🆔️: <b>${character.id}</b>
                <b>🔍 Globally Guessed: ${globalCount} Times...</b>
            `;
        }

        return {
            type: 'photo', // Specify the type
            id: `${character.id}_${Date.now()}`,
            photo_url: character.img_url,
            thumb_url: character.img_url,
            caption: caption,
            parse_mode: 'HTML'
        };
    }));

    return bot.answerInlineQuery(query.id, results, {
        cache_time: 5,
        next_offset: nextOffset ? nextOffset : '',
    });
}

// Escape HTML function for safety
function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;',
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}