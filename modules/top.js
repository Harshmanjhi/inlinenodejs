const fs = require('fs');

const OWNER_ID = process.env.OWNER_ID;
const SUDO_USERS = process.env.SUDO_USERS ? process.env.SUDO_USERS.split(',') : [];
const PHOTO_URL = 'https://envs.sh/AQm.jpg';

async function ctop(ctx) {
    const chatId = ctx.chat?.id;

    if (!chatId) {
        await ctx.reply('This command can only be used in a group chat.');
        return;
    }

    const cursor = await ctx.db.groupUserTotalsCollection.aggregate([
        { $match: { group_id: chatId } },
        { $project: { username: 1, first_name: 1, character_count: "$count" } },
        { $sort: { character_count: -1 } },
        { $limit: 10 }
    ]).toArray();

    let leaderboardMessage = "<b>TOP 10 USERS WHO GUESSED CHARACTERS MOST TIME IN THIS GROUP..</b>\n\n";

    cursor.forEach((user, index) => {
        const username = user.username || 'Unknown';
        let firstName = user.first_name ? user.first_name : 'Unknown';
        if (firstName.length > 10) firstName = firstName.slice(0, 15) + '...';
        const characterCount = user.character_count;

        leaderboardMessage += `${index + 1}. <a href="https://t.me/${username}"><b>${firstName}</b></a> ➾ <b>${characterCount}</b>\n`;
    });

    const photoUrl = PHOTO_URL;

    await ctx.replyWithPhoto(photoUrl, { caption: leaderboardMessage, parse_mode: 'HTML' });
}

async function globalLeaderboard(ctx) {
    const cursor = await ctx.db.topGlobalGroupsCollection.aggregate([
        { $project: { group_name: 1, count: 1 } },
        { $sort: { count: -1 } },
        { $limit: 10 }
    ]).toArray();

    let leaderboardMessage = "<b>TOP 10 GROUPS WHO GUESSED MOST CHARACTERS</b>\n\n";

    cursor.forEach((group, index) => {
        let groupName = group.group_name || 'Unknown';
        if (groupName.length > 10) groupName = groupName.slice(0, 15) + '...';
        const count = group.count;

        leaderboardMessage += `${index + 1}. <b>${groupName}</b> ➾ <b>${count}</b>\n`;
    });

    const photoUrl = PHOTO_URL;

    await ctx.replyWithPhoto(photoUrl, { caption: leaderboardMessage, parse_mode: 'HTML' });
}

async function stats(ctx) {
    if (ctx.from?.id.toString() !== OWNER_ID) {
        await ctx.reply("You are not authorized to use this command.");
        return;
    }

    const userCount = await ctx.db.destinationCharCollection.countDocuments({});
    const groupCount = await ctx.db.groupUserTotalsCollection.distinct('group_id');

    await ctx.reply(`Total Users: ${userCount}\nTotal groups: ${groupCount.length}`);
}

async function sendUsersDocument(ctx) {
    if (!ctx.from || !SUDO_USERS.includes(ctx.from.id.toString())) {
        await ctx.reply('Only For Sudo users...');
        return;
    }

    const cursor = ctx.db.destinationCharCollection.find({});
    const users = await cursor.toArray();
    const userList = users.map(user => user.first_name).join('\n');

    fs.writeFileSync('users.txt', userList);
    await ctx.replyWithDocument({ source: 'users.txt' });
    fs.unlinkSync('users.txt'); // Remove file after sending
}

async function sendGroupsDocument(ctx) {
    if (!ctx.from || !SUDO_USERS.includes(ctx.from.id.toString())) {
        await ctx.reply('Only For Sudo users...');
        return;
    }

    const cursor = ctx.db.topGlobalGroupsCollection.find({});
    const groups = await cursor.toArray();
    const groupList = groups.map(group => group.group_name).join('\n\n');

    fs.writeFileSync('groups.txt', groupList);
    await ctx.replyWithDocument({ source: 'groups.txt' });
    fs.unlinkSync('groups.txt'); // Remove file after sending
}

module.exports = {
    ctop,
    globalLeaderboard,
    stats,
    sendUsersDocument,
    sendGroupsDocument
};