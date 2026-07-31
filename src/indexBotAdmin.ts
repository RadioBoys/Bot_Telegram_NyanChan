import { Bot, Context } from 'grammy';
import * as dotenv from 'dotenv';
import { upsertUser } from './userModel.js';

dotenv.config();

const BOT_TOKEN = new Bot(process.env.BOT_TOKEN || '');    // Get Bot token
const ADMIN_IDS = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',').map(Number) : [];         // Get Admin Id (Hard Code)

// Function check admin hard code and admin in Channel / Group
// ---------------Admin hard code---------------
export function isAdminHardCode(userId: number | undefined): boolean {
    if (!userId) {
        return false;
    }
    return ADMIN_IDS.includes(userId);
};

// ---------------Admin Channel / Group---------------
export async function isGroupChannelAdmin(ctx: Context, userId?: number): Promise<boolean> {
    const targetId = userId || ctx.from?.id;
    if (!targetId || !ctx.chat) return false;

    // Check chat is private?
    if (ctx.chat.type === 'private') return false;

    try {
        // Get info member
        const member = await ctx.api.getChatMember(ctx.chat.id, targetId);
        // Check permission of member
        return member.status === "administrator" || member.status === "creator"
    } catch (err) {
        console.log('Admin Group/Channel: ', err);
        return false;
    }
};

// Delete command after delay
async function deleteCommandDelay(ctx: Context, delay: number) {
    if (ctx.chat?.type === 'private') return;
    setTimeout(async () => {
        try {
            await ctx.deleteMessage();
        } catch (err) {
            console.log("Lỗi khi xóa lệnh: ", err);
        }
    }, delay);
}

// ---------------Listen Message---------------
BOT_TOKEN.on('message', async (ctx, next) => {
    const user = ctx.from;
    
    if (user && !user.is_bot) {
        const userId = user.id;
        const username = user.username || '';
        const firstName = user.first_name || '';
        const lastName = user.last_name || ''; 

        try {
            // Gọi hàm cập nhật Database
            await upsertUser(userId, username, firstName, lastName);
        } catch (error) {
            console.error('Lỗi khi lưu user data trong luồng message: ', error);
        }
    }

    await next();
});

// Bot command : /start, /help, /promote, /demote, /check, /uncheck, /checkpermission, /mute, /unmute, /ban, /unban
// ---------------Slash start---------------
BOT_TOKEN.command('start', async (ctx) => {
    const userId = ctx.from?.id;
    // Check permission admin
    const isHardAdmin = isAdminHardCode(userId);
    const isChatAdmin = await isGroupChannelAdmin(ctx, userId);

    if (!isHardAdmin && !isChatAdmin) {
        // Dành cho thành viên bình thường
        const msg = await ctx.reply("Chỉ Admin mới có thể sử dụng lệnh này!", { parse_mode: "Markdown" });
        try {
            setTimeout(async () => {
                await ctx.api.deleteMessage(ctx.chat.id, msg.message_id);
            }, 5000);
        } catch (error) {
            console.log('Lỗi không xóa được bảng cảnh cáo ', error);
        }
    } else {
        // Dành cho Admin (Hardcode hoặc Group Admin)
        await ctx.reply("Muốn xem thử Bot làm được gì không? Ấn `/help` đi là biết 😏!", { parse_mode: "Markdown" });
    }
    await deleteCommandDelay(ctx, 5000);
});

// ---------------Slash help---------------
BOT_TOKEN.command('help', async (ctx) => {
    const userId = ctx.from?.id;

    const helpMessage = `
    🤖 **Danh sách lệnh quản trị của Bot:**

1. /start - Kiểm tra trạng thái bot.
2. /promote [id, reply] - Cấp quyền Admin cho User.
3. /demote [id, reply] - Gỡ quyền Admin User.
4. /check | /uncheck [id, reply] [All, Permission] - Thêm / xóa 1 hoặc tất cả các quyền của Admin
5. /checkpermission [id, reply] - Kiểm tra quyền Admin của User.
6. /help - Hiển thị bảng hướng dẫn này.

⚠️ **Lưu ý:** - Bạn cần Reply tin nhắn của thành viên khi dùng /promote hoặc /demote.
- Bot chỉ thực hiện lệnh nếu bạn nằm trong danh sách Admin được chỉ định.
    `;

    try {
        // Check permission admin
        const isHardAdmin = isAdminHardCode(userId);
        const isChatAdmin = await isGroupChannelAdmin(ctx, userId);

        if (!isHardAdmin && !isChatAdmin) {
            const msg = await ctx.reply("❌ Bạn không có quyền sử dụng lệnh này!");

            setTimeout(async () => {
                try {
                    await ctx.api.deleteMessage(ctx.chat.id, msg.message_id);
                } catch (err) {
                    console.log('Lỗi không xóa được bảng help:', err);
                }
            }, 5000);

            return;
        }
        // Delete slash user
        await deleteCommandDelay(ctx, 5000);
        await ctx.reply(helpMessage);

    } catch (err) {
        console.log('Lỗi lệnh /help: ', err);
        try {
            await ctx.reply('⚠️ Có lỗi xảy ra khi hiển thị bảng trợ giúp!');
        } catch (replyErr) {
            console.error('Không thể gửi tin nhắn báo lỗi:', replyErr);
        }
    }
});

// ---------------Slash promote---------------
BOT_TOKEN.command('promote', async (ctx) => {
    // Only hard code Admin can do this
    const userId = ctx.from?.id;
    const isHardAdmin = isAdminHardCode(userId);

    if (!isHardAdmin) {
        const msg = await ctx.reply("❌ Bạn không có quyền sử dụng lệnh này! Chỉ Boss hoặc NyanChan mới có thể dùng! ");
        setTimeout(async () => {
            try {
                await ctx.api.deleteMessage(ctx.chat.id, msg.message_id);
            } catch (error) {
                console.log('Lỗi không xóa được lệnh /promote', error);
            }
        }, 5000);
        return;
    }
    // Delete slash user
    await deleteCommandDelay(ctx, 5000);

    // Get ID User from reply message OR /promote [ID]
    let targetUserId: number | undefined;
    let displayName = "User"; // <--- THÊM BIẾN TÊN HIỂN THỊ

    try {
        if (ctx.message?.reply_to_message) {
            const targetUser = ctx.message.reply_to_message.from; // <--- LẤY INFO TỪ REPLY
            if (targetUser) {
                targetUserId = targetUser.id;   // Get ID User from Reply Message
                displayName = targetUser.username ? `@${targetUser.username}` : `${targetUser.first_name} ${targetUser.last_name}`; // <--- LẤY TÊN
            }
        } else {
            const args = ctx.match.trim();
            if (!args) {
                return await ctx.reply('Reply tin nhắn hoặc nhập /promote [ID]');
            }

            if (args.startsWith('@') || isNaN(Number(args))) {
                return await ctx.reply('Chỉ nhận truyền tham số ID hoặc Reply tin nhắn User');
            }
            targetUserId = Number(args);    // Get ID User from /promote [ID]

            // <--- THÊM LOGIC GỌI API LẤY TÊN NẾU NHẬP BẰNG ID --->
            if (ctx.chat && targetUserId) {
                try {
                    const member = await ctx.api.getChatMember(ctx.chat.id, targetUserId);
                    const targetUser = member.user;
                    displayName = targetUser.username ? `@${targetUser.username}` : `${targetUser.first_name} ${targetUser.last_name}`;
                } catch (error) {
                    displayName = `ID ${targetUserId}`; // Đề phòng lỗi
                }
            }
        }

        if (!targetUserId) {
            return ctx.reply('Không tìm thấy ID User ');
        }
    } catch (error) {
        console.log('Lỗi lệnh /promote: ', error);
        return;
    }

    try {
        // Add permission Admin
        await ctx.api.promoteChatMember(ctx.chat.id, targetUserId, {
            can_manage_chat: true,
            can_post_messages: false,
            can_edit_messages: false,
            can_delete_messages: false,
            can_pin_messages: false,
            can_restrict_members: false,
            can_promote_members: false,
            can_change_info: false,
            can_invite_users: false,
            can_manage_video_chats: false,
            can_manage_topics: false,
            can_post_stories: false,
            can_edit_stories: false,
            can_delete_stories: false,
            is_anonymous: false
        });
        // <--- ĐỔI targetUserId THÀNH displayName Ở ĐÂY --->
        await ctx.reply(`✅ Đã cấp quyền Admin cho <b>${displayName}</b>`, { parse_mode: 'HTML' });
    } catch (error) {
        console.log('Lỗi lệnh /promote: ', error);
        return await ctx.reply('⚠️ Lỗi: Không thể cấp quyền Admin');
    }

});

// ---------------Slash demote---------------
BOT_TOKEN.command('demote', async (ctx) => {
    // ONLY hardcode admin can do this
    const userId = ctx.from?.id;
    const isHardAdmin = isAdminHardCode(userId);

    if (!isHardAdmin) {
        const msg = await ctx.reply("❌ Bạn không có quyền sử dụng lệnh này! Chỉ Boss hoặc NyanChan mới có thể dùng! ");
        setTimeout(async () => {
            try {
                await ctx.api.deleteMessage(ctx.chat.id, msg.message_id);
            } catch (error) {
                console.log('Lỗi không xóa được lệnh /demote', error);
            }
        }, 5000);
        return;
    }

    // Delete slash user
    await deleteCommandDelay(ctx, 5000);

    // Get ID User from reply message OR /demote [ID]
    let targetUserId: number | undefined;
    let displayName = "User";

    try {
        if (ctx.message?.reply_to_message) {
            const targetUser = ctx.message.reply_to_message.from;
            if (targetUser) {
                targetUserId = targetUser.id;   // Get ID User from Reply Message
                displayName = targetUser.username ? `@${targetUser.username}` : `${targetUser.first_name} ${targetUser.last_name}`;
            }
        } else { // <--- Đã đưa else ra ngoài cho ngang hàng với if reply
            const args = ctx.match.trim();
            if (!args) {
                return await ctx.reply('Reply tin nhắn hoặc nhập /demote [ID]');
            }

            if (args.startsWith('@') || isNaN(Number(args))) {
                return await ctx.reply('Chỉ nhận truyền tham số ID hoặc Reply tin nhắn User');
            }
            targetUserId = Number(args);    // Get ID User from /demote [ID]

            if (ctx.chat && targetUserId) {
                try {
                    const member = await ctx.api.getChatMember(ctx.chat.id, targetUserId);
                    const targetUser = member.user;
                    displayName = targetUser.username ? `@${targetUser.username}` : `${member.user.first_name} ${member.user.last_name}`;
                } catch (error) {
                    displayName = `ID ${targetUserId}`;
                }
            }
        }

        if (!targetUserId) {
            return ctx.reply('Không tìm thấy ID User ');
        }

    } catch (error) {
        console.log('Lỗi lệnh /demote: ', error);
        return;
    }

    try {
        await ctx.api.promoteChatMember(ctx.chat.id, targetUserId as number, {
            can_manage_chat: false,
            can_post_messages: false,
            can_edit_messages: false,
            can_delete_messages: false,
            can_pin_messages: false,
            can_restrict_members: false,
            can_promote_members: false,
            can_change_info: false,
            can_invite_users: false,
            can_manage_video_chats: false,
            can_manage_topics: false,
            can_post_stories: false,
            can_edit_stories: false,
            can_delete_stories: false,
            is_anonymous: false
        })
        await ctx.reply(`✅ Gỡ Admin <b>${displayName}</b> thành công`, { parse_mode: 'HTML' });

    } catch (error) {
        console.log('Lỗi lệnh /demote: ', error);
        return await ctx.reply('⚠️ Lỗi: Không thể gỡ quyền Admin');
    }
});

// ---------------Slash check---------------
BOT_TOKEN.command('check', async (ctx) => {
    // Only Hard Code Admin can do this
    const userId = ctx.from?.id;
    const isHardAdmin = isAdminHardCode(userId);

    if (!isHardAdmin) {
        const msg = await ctx.reply("❌ Bạn không có quyền sử dụng lệnh này! Chỉ Boss hoặc NyanChan mới có thể dùng! ");
        setTimeout(async () => {
            try {
                await ctx.api.deleteMessage(ctx.chat.id, msg.message_id);
            } catch (error) {
                console.log('Lỗi không xóa được cảnh báo', error);
            }
        }, 5000);
        return;
    }

    // Delete slash user
    await deleteCommandDelay(ctx, 5000);

    let targetUserId: number | undefined;
    let displayName = "User";
    let requestedPerms: string[] = [];

    const rightMap: { [key: string]: keyof import("grammy/types").ChatAdministratorRights } = {
        "manage": "can_manage_chat",
        "post": "can_post_messages",
        "edit": "can_edit_messages",
        "delete": "can_delete_messages",
        "restrict": "can_restrict_members",
        "promote": "can_promote_members",
        "info": "can_change_info",
        "invite": "can_invite_users",
        "pin": "can_pin_messages",
        "video": "can_manage_video_chats",
        "topics": "can_manage_topics",
        "stories": "can_post_stories",
        "edit_stories": "can_edit_stories",
        "del_stories": "can_delete_stories",
        "anonymous": "is_anonymous"
    };

    try {
        // Split remove space
        const args = ctx.match.trim().split(/\s+/).filter(a => a);

        // If reply
        if (ctx.message?.reply_to_message) {
            const targetUser = ctx.message.reply_to_message.from;
            if (targetUser) {
                targetUserId = targetUser.id;
                displayName = targetUser.username ? `@${targetUser.username}` : `${targetUser.first_name} ${targetUser.last_name}`;
            }
            requestedPerms = args;  //If reply, All text is a request
        } else {
            // If user enter have [ID]
            if (args.length < 2) {
                return await ctx.reply(`⚠️ Không nhận diện được quyền nào.\nCác quyền hợp lệ: \n<code>${Object.keys(rightMap).join('\n')}\n\nall - Tất cả quyền</code>`, { parse_mode: 'HTML' });

            }

            const idArg = args[0];  // Get ID User;
            if (!idArg) {
                return await ctx.reply("Truyền đúng ID User hoặc reply tin nhắn User!");
            }
            if (idArg.startsWith('@') || isNaN(Number(idArg))) {
                return await ctx.reply('❌ Tham số đầu tiên bắt buộc phải là **ID số**!', { parse_mode: 'Markdown' });
            }
            targetUserId = Number(idArg);
            requestedPerms = args.slice(1);

            // Get name of User
            if (ctx.chat) {
                try {
                    const member = await ctx.api.getChatMember(ctx.chat.id, targetUserId);
                    displayName = member.user.username ? `@${member.user.username}` : `${member.user.first_name} ${member.user.last_name}`;
                } catch (error) {
                    displayName = `ID ${targetUserId}`;
                }
            }
        }
        if (!targetUserId || !ctx.chat) {
            return await ctx.reply('❌ Không tìm thấy ID User.');
        }

        const member = await ctx.api.getChatMember(ctx.chat.id, targetUserId);
        if (member.status === 'creator') {
            return await ctx.reply("Owner luôn full quyền");
        }

        // Create permission and doesn't lost previous permission
        const newPermission: any = { can_manage_topics: false, is_anonymous: false };

        if (member.status === 'administrator') {
            for (const key of Object.values(rightMap)) {
                newPermission[key] = (member as any)[key] || false;
            }
        } else {
            for (const key of Object.values(rightMap)) {
                newPermission[key] = false;
            }
        }

        // Tick permission
        let updatedCount = 0;
        const isAll = requestedPerms.map(p => p.toLowerCase()).includes('all');

        if (isAll) {
            for (const key of Object.values(rightMap)) {
                if (key === "can_manage_topics") {
                    // Kiểm tra xem nhóm hiện tại có phải là Supergroup và có bật tính năng Topic (Forum) không
                    if (ctx.chat && ctx.chat.type === 'supergroup' && ctx.chat.is_forum) {
                        newPermission[key] = true;
                    } else {
                        newPermission[key] = false;
                    }
                } else {
                    newPermission[key] = true;
                }
            }
            // Đếm linh hoạt số lượng quyền thực tế đã được set thành true
            updatedCount = Object.values(newPermission).filter(v => v === true).length;
        } else {
            for (const p of requestedPerms) {
                const permKey = rightMap[p.toLowerCase()];
                if (permKey) {
                    newPermission[permKey] = true;
                    updatedCount++;
                }
            }
        }
        if (updatedCount === 0) {
            return await ctx.reply(`⚠️ Không nhận diện được quyền nào.\nCác quyền hợp lệ: <code>${Object.keys(rightMap).join(', ')}, all</code>`, { parse_mode: 'HTML' });
        }
        await ctx.api.promoteChatMember(ctx.chat.id, targetUserId, newPermission);
        await ctx.reply(`✅ Đã tick thêm <b>${isAll ? 'TẤT CẢ' : updatedCount}</b> quyền cho Admin <b>${displayName}</b>!`, { parse_mode: 'HTML' });
    } catch (error) {
        console.log('Lỗi lệnh /check: ', error);
        return await ctx.reply('⚠️ Lỗi: Không thể sửa quyền cho người này. Đảm bảo Bot có đủ quyền hạn và cao hơn chức vụ của người đó!');
    }
})

// ---------------Slash uncheck---------------
BOT_TOKEN.command('uncheck', async (ctx) => {
    // Only Hard Code Admin can do this
    const userId = ctx.from?.id;
    const isHardAdmin = isAdminHardCode(userId);

    if (!isHardAdmin) {
        const msg = await ctx.reply("❌ Bạn không có quyền sử dụng lệnh này! Chỉ Boss hoặc NyanChan mới có thể dùng! ");
        setTimeout(async () => {
            try {
                await ctx.api.deleteMessage(ctx.chat.id, msg.message_id);
            } catch (error) {
                console.log('Lỗi không xóa được cảnh báo', error);
            }
        }, 5000);
        return;
    }

    // Delete slash user
    await deleteCommandDelay(ctx, 5000);

    let targetUserId: number | undefined;
    let displayName = "User";
    let requestedPerms: string[] = [];

    const rightMap: { [key: string]: keyof import("grammy/types").ChatAdministratorRights } = {
        "manage": "can_manage_chat",
        "post": "can_post_messages",
        "edit": "can_edit_messages",
        "delete": "can_delete_messages",
        "restrict": "can_restrict_members",
        "promote": "can_promote_members",
        "info": "can_change_info",
        "invite": "can_invite_users",
        "pin": "can_pin_messages",
        "video": "can_manage_video_chats",
        "topics": "can_manage_topics",
        "stories": "can_post_stories",
        "edit_stories": "can_edit_stories",
        "del_stories": "can_delete_stories",
        "anonymous": "is_anonymous"
    };

    try {
        const args = ctx.match.trim().split(/\s+/).filter(a => a);

        if (ctx.message?.reply_to_message) {
            const targetUser = ctx.message.reply_to_message.from;
            if (targetUser) {
                targetUserId = targetUser.id;
                displayName = targetUser.username ? `@${targetUser.username}` : `${targetUser.first_name} ${targetUser.last_name}`;
            }
            requestedPerms = args;
        } else {
            if (args.length < 2) {
                return await ctx.reply(`⚠️ Không nhận diện được quyền nào cần gỡ.\nCác quyền hợp lệ: \n<code>${Object.keys(rightMap).join('\n')}\n\nall - Gỡ tất cả quyền</code>`, { parse_mode: 'HTML' });
            }

            const idArg = args[0];
            if (!idArg) {
                return await ctx.reply("Truyền đúng ID User hoặc reply tin nhắn User!");
            }
            if (idArg.startsWith('@') || isNaN(Number(idArg))) {
                return await ctx.reply('❌ Tham số đầu tiên bắt buộc phải là **ID số**!', { parse_mode: 'Markdown' });
            }
            targetUserId = Number(idArg);
            requestedPerms = args.slice(1);

            if (ctx.chat) {
                try {
                    const member = await ctx.api.getChatMember(ctx.chat.id, targetUserId);
                    displayName = member.user.username ? `@${member.user.username}` : `${member.user.first_name} ${member.user.last_name}`;
                } catch (error) {
                    displayName = `ID ${targetUserId}`;
                }
            }
        }

        if (!targetUserId || !ctx.chat) {
            return await ctx.reply('❌ Không tìm thấy ID User.');
        }

        const member = await ctx.api.getChatMember(ctx.chat.id, targetUserId);

        if (member.status === 'creator') {
            return await ctx.reply("❌ Owner luôn full quyền, không thể gỡ (Uncheck)!");
        }

        if (member.status !== 'administrator') {
            return await ctx.reply("⚠️ Người này hiện không phải là Admin, không có quyền nào để gỡ!");
        }

        const newPermission: any = { can_manage_topics: false, is_anonymous: false };

        for (const key of Object.values(rightMap)) {
            newPermission[key] = (member as any)[key] || false;
        }

        let removedCount = 0;
        const isAll = requestedPerms.map(p => p.toLowerCase()).includes('all');

        if (isAll) {
            // Nếu là all, cho tất cả về false
            for (const key of Object.values(rightMap)) {
                newPermission[key] = false;
            }

            removedCount = Object.values(rightMap).filter(key => (member as any)[key] === true).length;
        } else {
            for (const p of requestedPerms) {
                const permKey = rightMap[p.toLowerCase()];

                if (permKey && newPermission[permKey] === true) {
                    newPermission[permKey] = false;
                    removedCount++;
                }
            }
        }

        if (removedCount === 0 && !isAll) {
            return await ctx.reply(`⚠️ Người này không có sẵn các quyền bạn yêu cầu gỡ, hoặc bạn gõ sai tên quyền.\nCác quyền hợp lệ: <code>${Object.keys(rightMap).join(', ')}, all</code>`, { parse_mode: 'HTML' });
        }

        await ctx.api.promoteChatMember(ctx.chat.id, targetUserId, newPermission);
        await ctx.reply(`✅ Đã gỡ bỏ <b>${isAll ? 'TẤT CẢ' : removedCount}</b> quyền của Admin <b>${displayName}</b>!`, { parse_mode: 'HTML' });

    } catch (error) {
        console.log('Lỗi lệnh /uncheck: ', error);
        return await ctx.reply('⚠️ Lỗi: Không thể sửa quyền cho người này. Đảm bảo Bot có đủ quyền hạn và cao hơn chức vụ của người đó!');
    }
});
// ---------------Slash checkpermission---------------
BOT_TOKEN.command('checkpermission', async (ctx) => {
    // Only Admin can do this
    const userId = ctx.from?.id;
    const isHardAdmin = isAdminHardCode(userId);
    const isChatAdmin = await isGroupChannelAdmin(ctx, userId);

    if (!isHardAdmin && !isChatAdmin) {
        const msg = await ctx.reply("❌ Bạn không có quyền sử dụng lệnh này! Chỉ Admin mới có thể dùng! ");
        setTimeout(async () => {
            try {
                await ctx.api.deleteMessage(ctx.chat.id, msg.message_id);
            } catch (error) {
                console.log('Lỗi không xóa được cảnh báo', error);
            }
        }, 5000);
        return;
    }
    // Delete slash user
    await deleteCommandDelay(ctx, 5000);

    // Get ID User from reply message OR /promote [ID]
    let targetUserId: number | undefined;
    try {
        // Get ID user from reply message
        if (ctx.message?.reply_to_message) {
            targetUserId = ctx.message.reply_to_message.from?.id;
        } else {
            const agrs = ctx.match.trim();
            if (!agrs) {
                return await ctx.reply('Reply tin nhắn hoặc nhập /checkpermission [ID]');
            }
            if (agrs.startsWith('@') || isNaN(Number(agrs))) {
                return await ctx.reply('Chỉ nhận truyền tham số ID hoặc Reply tin nhắn User');
            }
            targetUserId = Number(agrs);
        }
        if (!targetUserId) {
            return await ctx.reply('Không tìm thấy ID User');
        }
    } catch (error) {
        console.log('Lỗi lệnh /checkpermission: ', error);
        return;
    }

    try {
        const member = await ctx.api.getChatMember(ctx.chat.id, targetUserId);

        const targetUser = member.user;
        const displayName = targetUser.username ? `@${targetUser.username}` : `${targetUser.first_name} ${targetUser.last_name}`;

        let response = `📋  Quyền hạn của ${displayName} gồm:\n\n`;

        const permissionMap: { [key: string]: string } = {
            can_manage_chat: "Quản lý nhóm",
            can_delete_messages: "Xóa tin nhắn",
            can_pin_messages: "Ghim tin nhắn",
            can_restrict_members: "Chặn thành viên",
            can_promote_members: "Thêm quản trị viên mới",
            can_change_info: "Thay đổi thông tin nhóm",
            can_invite_users: "Mời thành viên",
            can_manage_video_chats: "Quản lý video chat",
            can_manage_topics: "Quản lý chủ đề",
            can_post_stories: "Đăng Stories",
            can_edit_stories: "Sửa Stories",
            can_delete_stories: "Xóa Stories",
            is_anonymous: "Ẩn danh"
        };

        for (const [key, label] of Object.entries(permissionMap)) {
            const hasRight = (member as any)[key] === true;
            response += `${hasRight ? "✅" : "❌"} ${label}\n`;
        }

        ctx.reply(response, { parse_mode: "Markdown" });
    } catch (e) {
        ctx.reply("Lỗi: Không thể lấy thông tin người này. Bot có thể chưa được cấp quyền.");
    }
});

// ---------------Slash mute---------------
BOT_TOKEN.command('mute', async (ctx) => {
    const userId = ctx.from?.id;
    const isHardAdmin = isAdminHardCode(userId);
    const isChatAdmin = await isGroupChannelAdmin(ctx, userId);

    if (!isHardAdmin && !isChatAdmin) {
        const msg = await ctx.reply("❌ Bạn không có quyền sử dụng lệnh này! Chỉ Admin mới có thể dùng! ");
        setTimeout(async () => {
            try {
                await ctx.api.deleteMessage(ctx.chat.id, msg.message_id);
            } catch (error) {
                console.log('Lỗi không xóa được cảnh báo', error);
            }
        }, 5000);
        return;
    }

    // Delete slash user
    await deleteCommandDelay(ctx, 5000);

    let targetUserId: number | undefined;
    let displayName = "User";

    try {
        if (ctx.message?.reply_to_message) {
            const targetUser = ctx.message.reply_to_message.from;
            if (targetUser) {
                targetUserId = targetUser.id;
                displayName = `${targetUser.first_name} ${targetUser.last_name}` || `ID ${targetUserId}`;
            }
        } else {
            const args = ctx.match.trim();
            if (!args) {
                const msg = await ctx.reply('⚠️ Vui lòng Reply tin nhắn hoặc nhập /mute [ID]');
                setTimeout(() => ctx.api.deleteMessage(ctx.chat!.id, msg.message_id).catch(() => { }), 5000);
                return;
            }

            if (args.startsWith('@') || isNaN(Number(args))) {
                const msg = await ctx.reply('❌ Chỉ nhận truyền tham số ID hoặc Reply tin nhắn User!');
                setTimeout(() => ctx.api.deleteMessage(ctx.chat!.id, msg.message_id).catch(() => { }), 5000);
                return;
            }
            targetUserId = Number(args);

            if (ctx.chat && targetUserId) {
                try {
                    const member = await ctx.api.getChatMember(ctx.chat.id, targetUserId);
                    displayName = `${member.user.first_name} ${member.user.last_name}` || `ID ${targetUserId}`;
                } catch (error) {
                    displayName = `ID ${targetUserId}`;
                }
            }
        }

        if (!targetUserId) {
            const msg = await ctx.reply('❌ Không tìm thấy ID User.');
            setTimeout(() => ctx.api.deleteMessage(ctx.chat!.id, msg.message_id).catch(() => { }), 5000);
            return;
        }

    } catch (error) {
        console.log('Lỗi khối lấy ID lệnh /mute: ', error);
        return;
    }

    try {
        await ctx.api.restrictChatMember(ctx.chat.id, targetUserId, {
            can_send_messages: false,
            can_send_audios: false,
            can_send_documents: false,
            can_send_photos: false,
            can_send_videos: false,
            can_send_video_notes: false,
            can_send_voice_notes: false,
            can_send_polls: false,
            can_send_other_messages: false,
            can_add_web_page_previews: false,
        });

        await ctx.reply(`🤬 Shyyt: Câm miệng lại!\n✅ Muted "<b>${displayName}</b>"`, { parse_mode: 'HTML' });

    } catch (error) {
        console.log('Lỗi API lệnh /mute: ', error);
        await ctx.reply('⚠️ Lỗi: Không thể Mute người này. Đảm bảo Bot có quyền "Ban Users" (Chặn người dùng) và chức vụ cao hơn người đó!');
    }
})

// ---------------Slash unmute---------------
BOT_TOKEN.command('unmute', async (ctx) => {
    const userId = ctx.from?.id;
    const isHardAdmin = isAdminHardCode(userId);
    const isChatAdmin = await isGroupChannelAdmin(ctx, userId);

    if (!isHardAdmin && !isChatAdmin) {
        const msg = await ctx.reply("❌ Bạn không có quyền sử dụng lệnh này! Chỉ Admin mới có thể dùng! ");
        setTimeout(async () => {
            try {
                await ctx.api.deleteMessage(ctx.chat.id, msg.message_id);
            } catch (error) {
                console.log('Lỗi không xóa được cảnh báo', error);
            }
        }, 5000);
        return;
    }

    // Delete slash user
    await deleteCommandDelay(ctx, 5000);

    let targetUserId: number | undefined;
    let displayName = "User";

    try {
        if (ctx.message?.reply_to_message) {
            const targetUser = ctx.message.reply_to_message.from;
            if (targetUser) {
                targetUserId = targetUser.id;
                displayName = `${targetUser.first_name} ${targetUser.last_name}` || `ID ${targetUserId}`;
            }
        } else {
            const args = ctx.match.trim();
            if (!args) {
                const msg = await ctx.reply('⚠️ Vui lòng Reply tin nhắn hoặc nhập /unmute [ID]');
                setTimeout(() => ctx.api.deleteMessage(ctx.chat!.id, msg.message_id).catch(() => { }), 5000);
                return;
            }

            if (args.startsWith('@') || isNaN(Number(args))) {
                const msg = await ctx.reply('❌ Chỉ nhận truyền tham số ID hoặc Reply tin nhắn User!');
                setTimeout(() => ctx.api.deleteMessage(ctx.chat!.id, msg.message_id).catch(() => { }), 5000);
                return;
            }
            targetUserId = Number(args);

            if (ctx.chat && targetUserId) {
                try {
                    const member = await ctx.api.getChatMember(ctx.chat.id, targetUserId);
                    displayName = `${member.user.first_name} ${member.user.last_name}` || `ID ${targetUserId}`;
                } catch (error) {
                    displayName = `ID ${targetUserId}`;
                }
            }
        }

        if (!targetUserId) {
            const msg = await ctx.reply('❌ Không tìm thấy ID User.');
            setTimeout(() => ctx.api.deleteMessage(ctx.chat!.id, msg.message_id).catch(() => { }), 5000);
            return;
        }

    } catch (error) {
        console.log('Lỗi khối lấy ID lệnh /unmute: ', error);
        return;
    }

    try {
        await ctx.api.restrictChatMember(ctx.chat.id, targetUserId, {
            can_send_messages: true,
            can_send_audios: true,
            can_send_documents: true,
            can_send_photos: true,
            can_send_videos: true,
            can_send_video_notes: true,
            can_send_voice_notes: true,
            can_send_polls: true,
            can_send_other_messages: true,
            can_add_web_page_previews: true,
        });

        await ctx.reply(`"<b>${displayName}</b>" có thể chat lại bình thường!`, { parse_mode: 'HTML' });

    } catch (error) {
        console.log('Lỗi API lệnh /unmute: ', error);
        await ctx.reply('⚠️ Lỗi: Không thể Unmute người này. Đảm bảo Bot có quyền "Ban Users" (Chặn người dùng) và chức vụ cao hơn người đó!');
    }
})

// ---------------Slash ban---------------
BOT_TOKEN.command('ban', async (ctx) => {
    const userId = ctx.from?.id;
    const isHardAdmin = isAdminHardCode(userId);
    const isChatAdmin = await isGroupChannelAdmin(ctx, userId);

    if (!isHardAdmin && !isChatAdmin) {
        const msg = await ctx.reply("❌ Bạn không có quyền sử dụng lệnh này! Chỉ Admin mới có thể dùng! ");
        setTimeout(async () => {
            try {
                await ctx.api.deleteMessage(ctx.chat.id, msg.message_id);
            } catch (error) {
                console.log('Lỗi không xóa được cảnh báo', error);
            }
        }, 5000);
        return;
    }

    // Delete slash user
    await deleteCommandDelay(ctx, 5000);

    let targetUserId: number | undefined;
    let displayName = "User";

    try {
        if (ctx.message?.reply_to_message) {
            const targetUser = ctx.message.reply_to_message.from;
            if (targetUser) {
                targetUserId = targetUser.id;
                displayName = `${targetUser.first_name} ${targetUser.last_name}` || `ID ${targetUserId}`;
            }
        } else {
            const args = ctx.match.trim();
            if (!args) {
                const msg = await ctx.reply('⚠️ Vui lòng Reply tin nhắn hoặc nhập /ban [ID]');
                setTimeout(() => ctx.api.deleteMessage(ctx.chat!.id, msg.message_id).catch(() => { }), 5000);
                return;
            }

            if (args.startsWith('@') || isNaN(Number(args))) {
                const msg = await ctx.reply('❌ Chỉ nhận truyền tham số ID (số) hoặc Reply tin nhắn. Không dùng @username!');
                setTimeout(() => ctx.api.deleteMessage(ctx.chat!.id, msg.message_id).catch(() => { }), 5000);
                return;
            }
            targetUserId = Number(args);

            if (ctx.chat && targetUserId) {
                try {
                    const member = await ctx.api.getChatMember(ctx.chat.id, targetUserId);
                    displayName = `${member.user.first_name} ${member.user.last_name}` || `ID ${targetUserId}`;
                } catch (error) {
                    displayName = `ID ${targetUserId}`;
                }
            }
        }

        if (!targetUserId) {
            const msg = await ctx.reply('❌ Không tìm thấy ID người dùng.');
            setTimeout(() => ctx.api.deleteMessage(ctx.chat!.id, msg.message_id).catch(() => { }), 5000);
            return;
        }

    } catch (error) {
        console.log('Lỗi khối lấy ID lệnh /ban: ', error);
        return;
    }

    try {
        await ctx.api.banChatMember(ctx.chat.id, targetUserId);
        await ctx.reply(`Đã tiễn <b>${displayName}</b> ra đảo!\n\n✅ <b>Banned!</b>`, { parse_mode: 'HTML' });

    } catch (error) {
        console.log('Lỗi API lệnh /ban: ', error);
        await ctx.reply('⚠️ Lỗi: Không thể Ban người này. Đảm bảo Bot có quyền "Ban Users" (Chặn người dùng) và chức vụ cao hơn người đó!');
    }
});

// ---------------Slash unban---------------
BOT_TOKEN.command('unban', async (ctx) => {
    const userId = ctx.from?.id;
    const isHardAdmin = isAdminHardCode(userId);
    const isChatAdmin = await isGroupChannelAdmin(ctx, userId);

    if (!isHardAdmin && !isChatAdmin) {
        const msg = await ctx.reply("❌ Bạn không có quyền sử dụng lệnh này! Chỉ Admin mới có thể dùng! ");
        setTimeout(async () => {
            try {
                await ctx.api.deleteMessage(ctx.chat.id, msg.message_id);
            } catch (error) {
                console.log('Lỗi không xóa được cảnh báo', error);
            }
        }, 5000);
        return;
    }

    // Delete Slash User
    await deleteCommandDelay(ctx, 5000);

    let targetUserId: number | undefined;
    let displayName = "User";

    try {
        if (ctx.message?.reply_to_message) {
            const targetUser = ctx.message.reply_to_message.from;
            if (targetUser) {
                targetUserId = targetUser.id;
                displayName = `${targetUser.first_name} ${targetUser.last_name}` || `ID ${targetUserId}`;;
            }
        } else {
            const args = ctx.match.trim();
            if (!args) {
                const msg = await ctx.reply('⚠️ Vui lòng Reply tin nhắn hoặc nhập /unban [ID]');
                setTimeout(() => ctx.api.deleteMessage(ctx.chat!.id, msg.message_id).catch(() => { }), 5000);
                return;
            }

            if (args.startsWith('@') || isNaN(Number(args))) {
                const msg = await ctx.reply('❌ Chỉ nhận truyền tham số ID (số) hoặc Reply tin nhắn. Không dùng @username!');
                setTimeout(() => ctx.api.deleteMessage(ctx.chat!.id, msg.message_id).catch(() => { }), 5000);
                return;
            }
            targetUserId = Number(args);

            if (ctx.chat && targetUserId) {
                try {
                    const member = await ctx.api.getChatMember(ctx.chat.id, targetUserId);
                    displayName = `${member.user.first_name} ${member.user.last_name}` || `ID ${targetUserId}`;
                } catch (error) {
                    displayName = `ID ${targetUserId}`;
                }
            }
        }

        if (!targetUserId) {
            const msg = await ctx.reply('❌ Không tìm thấy ID người dùng.');
            setTimeout(() => ctx.api.deleteMessage(ctx.chat!.id, msg.message_id).catch(() => { }), 5000);
            return;
        }

    } catch (error) {
        console.log('Lỗi khối lấy ID lệnh /unban: ', error);
        return;
    }

    try {
        await ctx.api.unbanChatMember(ctx.chat.id, targetUserId);
        await ctx.reply(`🙂 <b>${displayName}</b> đã được ân xá`, { parse_mode: 'HTML' });

    } catch (error) {
        console.log('Lỗi API lệnh /unban: ', error);
        await ctx.reply('⚠️ Lỗi: Không thể Unban người này. Đảm bảo Bot có quyền "Ban Users" (Chặn người dùng)!');
    }
});


// Start bot
BOT_TOKEN.start({
    onStart: (botInfo) => {
        console.log(`✅ Bot @${botInfo.username} đã khởi động!!`);
    }
});

