// ==========================================
// FILE: ./src/indexBotAdmin.ts
// ==========================================

import { Bot, Context } from 'grammy';
import * as dotenv from 'dotenv';
// Cập nhật import thêm hàm getIdFromUsername từ userModel
import { upsertUser, getIdFromUsername } from './userModel.js';

dotenv.config();

const BOT_TOKEN = new Bot(process.env.BOT_TOKEN_TEST || process.env.BOT_TOKEN || '');
const ADMIN_IDS = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',').map(Number) : [];

// ---------------Admin hard code---------------
export function isAdminHardCode(userId: number | undefined): boolean {
    if (!userId) return false;
    return ADMIN_IDS.includes(userId);
}

// ---------------Admin Channel / Group---------------
export async function isGroupChannelAdmin(ctx: Context, userId?: number): Promise<boolean> {
    const targetId = userId || ctx.from?.id;
    if (!targetId || !ctx.chat) return false;
    if (ctx.chat.type === 'private') return false;

    try {
        const member = await ctx.api.getChatMember(ctx.chat.id, targetId);
        return member.status === "administrator" || member.status === "creator";
    } catch (err) {
        console.log('Admin Group/Channel (Không có quyền hoặc user không tồn tại): ', (err as Error).message);
        return false;
    }
}

// ---------------Delete command after delay---------------
async function deleteCommandDelay(ctx: Context, delay: number) {
    if (ctx.chat?.type === 'private') return;
    setTimeout(async () => {
        try {
            await ctx.deleteMessage();
        } catch (err) {
            // console.log("Lỗi khi xóa lệnh: ", err.message);
        }
    }, delay);
}

// ==========================================
// HÀM HELPER: LẤY ID & ĐỊNH DẠNG TÊN XỊN XÒ
// ==========================================
export async function resolveTargetUser(ctx: Context, userArg?: string) {
    let targetUserId: number | undefined;
    let targetUser: import("grammy/types").User | undefined;
    let displayName = "User";

    // Ưu tiên 1: Lấy từ Reply
    if (ctx.message?.reply_to_message) {
        targetUser = ctx.message.reply_to_message.from;
        targetUserId = targetUser?.id;
    } 
    // Ưu tiên 2: Lấy từ tham số truyền vào (userArg)
    else {
        if (!userArg) {
            return { error: '⚠️ Vui lòng Reply tin nhắn hoặc nhập tham số (ID / @username)' };
        }

        if (userArg.startsWith('@')) {
            // Dò trong Database bằng SQL
            const dbId = await getIdFromUsername(userArg);
            if (dbId) {
                targetUserId = dbId;
            } else {
                return { error: `❌ Không tìm thấy thông tin ${userArg} trong Database.\nYêu cầu người này chat 1 câu vào nhóm, hoặc dùng ID số/Reply tin nhắn!` };
            }
        } else if (!isNaN(Number(userArg))) {
            // Truyền bằng ID số
            targetUserId = Number(userArg);
        } else {
            return { error: '❌ Tham số đầu tiên bắt buộc phải là ID (số), @username hoặc Reply tin nhắn!' };
        }
    }

    // Lấy thông tin user hiện tại từ API Telegram để đảm bảo Tên / Quyền hạn luôn mới nhất
    if (ctx.chat && targetUserId && !targetUser) {
        try {
            const member = await ctx.api.getChatMember(ctx.chat.id, targetUserId);
            targetUser = member.user;
        } catch (error) {
            // Bỏ qua lỗi nếu họ rời nhóm, sẽ Fallback về ID
        }
    }

    // ĐỊNH DẠNG TÊN: Full Name -> @username -> ID
    if (targetUser) {
        const firstName = targetUser.first_name || '';
        const lastName = targetUser.last_name || '';
        const fullName = `${firstName} ${lastName}`.trim();

        displayName = fullName ? fullName : (targetUser.username ? `@${targetUser.username}` : `ID ${targetUserId}`);
    } else if (targetUserId) {
        displayName = `ID ${targetUserId}`;
    }

    if (!targetUserId) {
        return { error: '❌ Không tìm thấy ID người dùng.' };
    }

    return { targetUserId, displayName, targetUser };
}


// ---------------Listen Message & UPSERT DATABASE---------------
BOT_TOKEN.on('message', async (ctx, next) => {
    const user = ctx.from;
    if (user && !user.is_bot) {
        try {
            await upsertUser(user.id, user.username || '', user.first_name || '', user.last_name || '');
        } catch (error) {
            console.error('Lỗi khi lưu user data trong luồng message: ', error);
        }
    }
    await next();
});


// ==========================================
// CÁC LỆNH ADMIN (COMMANDS)
// ==========================================

// ---------------Slash start---------------
BOT_TOKEN.command('start', async (ctx) => {
    const userId = ctx.from?.id;
    const isHardAdmin = isAdminHardCode(userId);
    const isChatAdmin = await isGroupChannelAdmin(ctx, userId);

    if (!isHardAdmin && !isChatAdmin) {
        const msg = await ctx.reply("Chỉ Admin mới có thể sử dụng lệnh này!", { parse_mode: "Markdown" });
        setTimeout(async () => {
            try { await ctx.api.deleteMessage(ctx.chat!.id, msg.message_id); } catch (e) {}
        }, 5000);
    } else {
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
2. /promote [id, @username, reply] - Cấp quyền Admin cho User.
3. /demote [id, @username, reply] - Gỡ quyền Admin User.
4. /check | /uncheck [id, @username, reply] [All, Permission] - Thêm / xóa 1 hoặc tất cả quyền Admin.
5. /checkpermission [id, @username, reply] - Kiểm tra quyền Admin của User.
6. /help - Hiển thị bảng hướng dẫn này.

⚠️ **Lưu ý:** - Bot tự động tra cứu @username qua SQL Database.
    `;

    try {
        const isHardAdmin = isAdminHardCode(userId);
        const isChatAdmin = await isGroupChannelAdmin(ctx, userId);

        if (!isHardAdmin && !isChatAdmin) {
            const msg = await ctx.reply("❌ Bạn không có quyền sử dụng lệnh này!");
            setTimeout(async () => {
                try { await ctx.api.deleteMessage(ctx.chat!.id, msg.message_id); } catch (e) {}
            }, 5000);
            return;
        }

        await deleteCommandDelay(ctx, 5000);
        await ctx.reply(helpMessage, { parse_mode: "Markdown" });
    } catch (err) {
        console.log('Lỗi lệnh /help: ', err);
    }
});

// ---------------Slash promote---------------
BOT_TOKEN.command('promote', async (ctx) => {
    if (ctx.chat?.type === 'private') return await ctx.reply("❌ Lệnh này chỉ dùng được trong Group/Channel!");
    
    const userId = ctx.from?.id;
    if (!isAdminHardCode(userId)) {
        const msg = await ctx.reply("❌ Chỉ Boss hoặc NyanChan mới có thể cấp quyền Admin!");
        setTimeout(() => ctx.api.deleteMessage(ctx.chat!.id, msg.message_id).catch(() => {}), 5000);
        return;
    }
    await deleteCommandDelay(ctx, 5000);

    const args = ctx.match.trim().split(/\s+/).filter(a => a);
    const userArg = ctx.message?.reply_to_message ? undefined : args[0];
    
    const resolved = await resolveTargetUser(ctx, userArg);
    if (resolved.error) {
        const msg = await ctx.reply(resolved.error);
        setTimeout(() => ctx.api.deleteMessage(ctx.chat!.id, msg.message_id).catch(() => {}), 5000);
        return;
    }

    try {
        await ctx.api.promoteChatMember(ctx.chat!.id, resolved.targetUserId!, {
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
        await ctx.reply(`✅ Đã cấp quyền Admin cơ bản cho <b>${resolved.displayName}</b>`, { parse_mode: 'HTML' });
    } catch (error) {
        console.log('Lỗi lệnh /promote: ', (error as Error).message);
        return await ctx.reply('⚠️ Lỗi: Không thể cấp quyền Admin. Bot chưa đủ quyền hạn!');
    }
});

// ---------------Slash demote---------------
BOT_TOKEN.command('demote', async (ctx) => {
    if (ctx.chat?.type === 'private') return await ctx.reply("❌ Lệnh này chỉ dùng được trong Group/Channel!");
    
    const userId = ctx.from?.id;
    if (!isAdminHardCode(userId)) {
        const msg = await ctx.reply("❌ Chỉ Boss hoặc NyanChan mới có thể gỡ quyền Admin!");
        setTimeout(() => ctx.api.deleteMessage(ctx.chat!.id, msg.message_id).catch(() => {}), 5000);
        return;
    }
    await deleteCommandDelay(ctx, 5000);

    const args = ctx.match.trim().split(/\s+/).filter(a => a);
    const userArg = ctx.message?.reply_to_message ? undefined : args[0];
    
    const resolved = await resolveTargetUser(ctx, userArg);
    if (resolved.error) {
        const msg = await ctx.reply(resolved.error);
        setTimeout(() => ctx.api.deleteMessage(ctx.chat!.id, msg.message_id).catch(() => {}), 5000);
        return;
    }

    try {
        await ctx.api.promoteChatMember(ctx.chat!.id, resolved.targetUserId!, {
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
        });
        await ctx.reply(`✅ Gỡ Admin <b>${resolved.displayName}</b> thành công`, { parse_mode: 'HTML' });
    } catch (error) {
        return await ctx.reply('⚠️ Lỗi: Không thể gỡ quyền Admin');
    }
});

// ---------------Slash check (Cấp thêm quyền)---------------
BOT_TOKEN.command('check', async (ctx) => {
    if (ctx.chat?.type === 'private') return await ctx.reply("❌ Lệnh này chỉ dùng được trong Group!");
    
    const userId = ctx.from?.id;
    if (!isAdminHardCode(userId)) {
        const msg = await ctx.reply("❌ Bạn không có quyền sử dụng lệnh này!");
        setTimeout(() => ctx.api.deleteMessage(ctx.chat!.id, msg.message_id).catch(() => {}), 5000);
        return;
    }
    await deleteCommandDelay(ctx, 5000);

    const rightMap: { [key: string]: keyof import("grammy/types").ChatAdministratorRights } = {
        "manage": "can_manage_chat", "post": "can_post_messages", "edit": "can_edit_messages",
        "delete": "can_delete_messages", "restrict": "can_restrict_members", "promote": "can_promote_members",
        "info": "can_change_info", "invite": "can_invite_users", "pin": "can_pin_messages",
        "video": "can_manage_video_chats", "topics": "can_manage_topics", "stories": "can_post_stories",
        "edit_stories": "can_edit_stories", "del_stories": "can_delete_stories", "anonymous": "is_anonymous"
    };

    try {
        const args = ctx.match.trim().split(/\s+/).filter(a => a);
        const isReply = !!ctx.message?.reply_to_message;
        const userArg = isReply ? undefined : args[0];
        const requestedPerms = isReply ? args : args.slice(1);

        const resolved = await resolveTargetUser(ctx, userArg);
        if (resolved.error) {
            const msg = await ctx.reply(resolved.error);
            setTimeout(() => ctx.api.deleteMessage(ctx.chat!.id, msg.message_id).catch(() => {}), 5000);
            return;
        }

        if (requestedPerms.length === 0) {
            return await ctx.reply(`⚠️ Không nhận diện được quyền nào.\nCác quyền hợp lệ: \n<code>${Object.keys(rightMap).join(', ')}, all</code>`, { parse_mode: 'HTML' });
        }

        const member = await ctx.api.getChatMember(ctx.chat!.id, resolved.targetUserId!);
        if (member.status === 'creator') return await ctx.reply("Owner luôn full quyền!");

        const newPermission: any = { can_manage_topics: false, is_anonymous: false };
        if (member.status === 'administrator') {
            for (const key of Object.values(rightMap)) {
                newPermission[key] = (member as any)[key] || false;
            }
        } else {
            for (const key of Object.values(rightMap)) newPermission[key] = false;
        }

        let updatedCount = 0;
        const isAll = requestedPerms.map(p => p.toLowerCase()).includes('all');

        if (isAll) {
            for (const key of Object.values(rightMap)) {
                if (key === "can_manage_topics") {
                    newPermission[key] = !!(ctx.chat && ctx.chat.type === 'supergroup' && ctx.chat.is_forum);
                } else {
                    newPermission[key] = true;
                }
            }
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
            return await ctx.reply(`⚠️ Bạn gõ sai tên quyền.\nHợp lệ: <code>${Object.keys(rightMap).join(', ')}, all</code>`, { parse_mode: 'HTML' });
        }

        await ctx.api.promoteChatMember(ctx.chat!.id, resolved.targetUserId!, newPermission);
        await ctx.reply(`✅ Đã tick thêm <b>${isAll ? 'TẤT CẢ' : updatedCount}</b> quyền cho Admin <b>${resolved.displayName}</b>!`, { parse_mode: 'HTML' });
    } catch (error) {
        return await ctx.reply('⚠️ Lỗi: Không thể sửa quyền cho người này.');
    }
});

// ---------------Slash uncheck (Gỡ quyền)---------------
BOT_TOKEN.command('uncheck', async (ctx) => {
    if (ctx.chat?.type === 'private') return await ctx.reply("❌ Lệnh này chỉ dùng được trong Group!");
    
    const userId = ctx.from?.id;
    if (!isAdminHardCode(userId)) {
        const msg = await ctx.reply("❌ Bạn không có quyền sử dụng lệnh này!");
        setTimeout(() => ctx.api.deleteMessage(ctx.chat!.id, msg.message_id).catch(() => {}), 5000);
        return;
    }
    await deleteCommandDelay(ctx, 5000);

    const rightMap: { [key: string]: keyof import("grammy/types").ChatAdministratorRights } = {
        "manage": "can_manage_chat", "post": "can_post_messages", "edit": "can_edit_messages",
        "delete": "can_delete_messages", "restrict": "can_restrict_members", "promote": "can_promote_members",
        "info": "can_change_info", "invite": "can_invite_users", "pin": "can_pin_messages",
        "video": "can_manage_video_chats", "topics": "can_manage_topics", "stories": "can_post_stories",
        "edit_stories": "can_edit_stories", "del_stories": "can_delete_stories", "anonymous": "is_anonymous"
    };

    try {
        const args = ctx.match.trim().split(/\s+/).filter(a => a);
        const isReply = !!ctx.message?.reply_to_message;
        const userArg = isReply ? undefined : args[0];
        const requestedPerms = isReply ? args : args.slice(1);

        const resolved = await resolveTargetUser(ctx, userArg);
        if (resolved.error) {
            const msg = await ctx.reply(resolved.error);
            setTimeout(() => ctx.api.deleteMessage(ctx.chat!.id, msg.message_id).catch(() => {}), 5000);
            return;
        }

        if (requestedPerms.length === 0) {
            return await ctx.reply(`⚠️ Cần cung cấp quyền.\nHợp lệ: <code>${Object.keys(rightMap).join(', ')}, all</code>`, { parse_mode: 'HTML' });
        }

        const member = await ctx.api.getChatMember(ctx.chat!.id, resolved.targetUserId!);
        if (member.status === 'creator') return await ctx.reply("❌ Owner luôn full quyền, không thể gỡ!");
        if (member.status !== 'administrator') return await ctx.reply("⚠️ Người này hiện không phải là Admin!");

        const newPermission: any = { can_manage_topics: false, is_anonymous: false };
        for (const key of Object.values(rightMap)) {
            newPermission[key] = (member as any)[key] || false;
        }

        let removedCount = 0;
        const isAll = requestedPerms.map(p => p.toLowerCase()).includes('all');

        if (isAll) {
            for (const key of Object.values(rightMap)) newPermission[key] = false;
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
            return await ctx.reply(`⚠️ Không có sẵn các quyền bạn yêu cầu gỡ.\nHợp lệ: <code>${Object.keys(rightMap).join(', ')}, all</code>`, { parse_mode: 'HTML' });
        }

        await ctx.api.promoteChatMember(ctx.chat!.id, resolved.targetUserId!, newPermission);
        await ctx.reply(`✅ Đã gỡ bỏ <b>${isAll ? 'TẤT CẢ' : removedCount}</b> quyền của Admin <b>${resolved.displayName}</b>!`, { parse_mode: 'HTML' });
    } catch (error) {
        return await ctx.reply('⚠️ Lỗi: Không thể sửa quyền cho người này.');
    }
});

// ---------------Slash checkpermission---------------
BOT_TOKEN.command('checkpermission', async (ctx) => {
    if (ctx.chat?.type === 'private') return await ctx.reply("❌ Lệnh này chỉ dùng được trong Group!");

    const userId = ctx.from?.id;
    const isHardAdmin = isAdminHardCode(userId);
    const isChatAdmin = await isGroupChannelAdmin(ctx, userId);

    if (!isHardAdmin && !isChatAdmin) {
        const msg = await ctx.reply("❌ Bạn không có quyền sử dụng lệnh này!");
        setTimeout(() => ctx.api.deleteMessage(ctx.chat!.id, msg.message_id).catch(() => {}), 5000);
        return;
    }
    await deleteCommandDelay(ctx, 5000);

    const args = ctx.match.trim().split(/\s+/).filter(a => a);
    const userArg = ctx.message?.reply_to_message ? undefined : args[0];
    
    const resolved = await resolveTargetUser(ctx, userArg);
    if (resolved.error) {
        const msg = await ctx.reply(resolved.error);
        setTimeout(() => ctx.api.deleteMessage(ctx.chat!.id, msg.message_id).catch(() => {}), 5000);
        return;
    }

    try {
        const member = await ctx.api.getChatMember(ctx.chat!.id, resolved.targetUserId!);
        
        let response = `📋  Quyền hạn của **${resolved.displayName}** gồm:\n\n`;
        const permissionMap: { [key: string]: string } = {
            can_manage_chat: "Quản lý nhóm", can_delete_messages: "Xóa tin nhắn",
            can_pin_messages: "Ghim tin nhắn", can_restrict_members: "Chặn thành viên",
            can_promote_members: "Thêm quản trị viên mới", can_change_info: "Thay đổi thông tin nhóm",
            can_invite_users: "Mời thành viên", can_manage_video_chats: "Quản lý video chat",
            can_manage_topics: "Quản lý chủ đề", can_post_stories: "Đăng Stories",
            can_edit_stories: "Sửa Stories", can_delete_stories: "Xóa Stories", is_anonymous: "Ẩn danh"
        };

        for (const [key, label] of Object.entries(permissionMap)) {
            const hasRight = (member as any)[key] === true;
            response += `${hasRight ? "✅" : "❌"} ${label}\n`;
        }

        await ctx.reply(response, { parse_mode: "Markdown" });
    } catch (e) {
        await ctx.reply("Lỗi: Không thể lấy thông tin người này.");
    }
});

// ---------------Slash mute---------------
BOT_TOKEN.command('mute', async (ctx) => {
    if (ctx.chat?.type === 'private') return await ctx.reply("❌ Lệnh này chỉ dùng được trong Group/Supergroup!");

    const userId = ctx.from?.id;
    const isHardAdmin = isAdminHardCode(userId);
    const isChatAdmin = await isGroupChannelAdmin(ctx, userId);

    if (!isHardAdmin && !isChatAdmin) {
        const msg = await ctx.reply("❌ Bạn không có quyền sử dụng lệnh này!");
        setTimeout(() => ctx.api.deleteMessage(ctx.chat!.id, msg.message_id).catch(() => {}), 5000);
        return;
    }
    await deleteCommandDelay(ctx, 5000);

    const args = ctx.match.trim().split(/\s+/).filter(a => a);
    const userArg = ctx.message?.reply_to_message ? undefined : args[0];
    
    const resolved = await resolveTargetUser(ctx, userArg);
    if (resolved.error) {
        const msg = await ctx.reply(resolved.error);
        setTimeout(() => ctx.api.deleteMessage(ctx.chat!.id, msg.message_id).catch(() => {}), 5000);
        return;
    }

    try {
        await ctx.api.restrictChatMember(ctx.chat!.id, resolved.targetUserId!, {
            can_send_messages: false, can_send_audios: false, can_send_documents: false,
            can_send_photos: false, can_send_videos: false, can_send_video_notes: false,
            can_send_voice_notes: false, can_send_polls: false, can_send_other_messages: false,
            can_add_web_page_previews: false,
        });
        await ctx.reply(`🤬 Shyyt: Câm miệng lại!\n✅ Muted "<b>${resolved.displayName}</b>"`, { parse_mode: 'HTML' });
    } catch (error) {
        await ctx.reply('⚠️ Lỗi: Không thể Mute người này. Bot có thể chưa đủ quyền!');
    }
});

// ---------------Slash unmute---------------
BOT_TOKEN.command('unmute', async (ctx) => {
    if (ctx.chat?.type === 'private') return await ctx.reply("❌ Lệnh này chỉ dùng được trong Group/Supergroup!");

    const userId = ctx.from?.id;
    const isHardAdmin = isAdminHardCode(userId);
    const isChatAdmin = await isGroupChannelAdmin(ctx, userId);

    if (!isHardAdmin && !isChatAdmin) {
        const msg = await ctx.reply("❌ Bạn không có quyền sử dụng lệnh này!");
        setTimeout(() => ctx.api.deleteMessage(ctx.chat!.id, msg.message_id).catch(() => {}), 5000);
        return;
    }
    await deleteCommandDelay(ctx, 5000);

    const args = ctx.match.trim().split(/\s+/).filter(a => a);
    const userArg = ctx.message?.reply_to_message ? undefined : args[0];
    
    const resolved = await resolveTargetUser(ctx, userArg);
    if (resolved.error) {
        const msg = await ctx.reply(resolved.error);
        setTimeout(() => ctx.api.deleteMessage(ctx.chat!.id, msg.message_id).catch(() => {}), 5000);
        return;
    }

    try {
        await ctx.api.restrictChatMember(ctx.chat!.id, resolved.targetUserId!, {
            can_send_messages: true, can_send_audios: true, can_send_documents: true,
            can_send_photos: true, can_send_videos: true, can_send_video_notes: true,
            can_send_voice_notes: true, can_send_polls: true, can_send_other_messages: true,
            can_add_web_page_previews: true,
        });
        await ctx.reply(`"<b>${resolved.displayName}</b>" có thể chat lại bình thường!`, { parse_mode: 'HTML' });
    } catch (error) {
        await ctx.reply('⚠️ Lỗi: Không thể Unmute người này. Bot có thể chưa đủ quyền!');
    }
});

// ---------------Slash ban---------------
BOT_TOKEN.command('ban', async (ctx) => {
    if (ctx.chat?.type === 'private') return await ctx.reply("❌ Lệnh này chỉ dùng được trong Group/Supergroup!");

    const userId = ctx.from?.id;
    const isHardAdmin = isAdminHardCode(userId);
    const isChatAdmin = await isGroupChannelAdmin(ctx, userId);

    if (!isHardAdmin && !isChatAdmin) {
        const msg = await ctx.reply("❌ Bạn không có quyền sử dụng lệnh này!");
        setTimeout(() => ctx.api.deleteMessage(ctx.chat!.id, msg.message_id).catch(() => {}), 5000);
        return;
    }
    await deleteCommandDelay(ctx, 5000);

    const args = ctx.match.trim().split(/\s+/).filter(a => a);
    const userArg = ctx.message?.reply_to_message ? undefined : args[0];
    
    const resolved = await resolveTargetUser(ctx, userArg);
    if (resolved.error) {
        const msg = await ctx.reply(resolved.error);
        setTimeout(() => ctx.api.deleteMessage(ctx.chat!.id, msg.message_id).catch(() => {}), 5000);
        return;
    }

    try {
        await ctx.api.banChatMember(ctx.chat!.id, resolved.targetUserId!);
        await ctx.reply(`Đã tiễn <b>${resolved.displayName}</b> ra đảo!\n\n✅ <b>Banned!</b>`, { parse_mode: 'HTML' });
    } catch (error) {
        await ctx.reply('⚠️ Lỗi: Không thể Ban người này. Bot có thể chưa đủ quyền!');
    }
});

// ---------------Slash unban---------------
BOT_TOKEN.command('unban', async (ctx) => {
    if (ctx.chat?.type === 'private') return await ctx.reply("❌ Lệnh này chỉ dùng được trong Group/Supergroup!");

    const userId = ctx.from?.id;
    const isHardAdmin = isAdminHardCode(userId);
    const isChatAdmin = await isGroupChannelAdmin(ctx, userId);

    if (!isHardAdmin && !isChatAdmin) {
        const msg = await ctx.reply("❌ Bạn không có quyền sử dụng lệnh này!");
        setTimeout(() => ctx.api.deleteMessage(ctx.chat!.id, msg.message_id).catch(() => {}), 5000);
        return;
    }
    await deleteCommandDelay(ctx, 5000);

    const args = ctx.match.trim().split(/\s+/).filter(a => a);
    const userArg = ctx.message?.reply_to_message ? undefined : args[0];
    
    const resolved = await resolveTargetUser(ctx, userArg);
    if (resolved.error) {
        const msg = await ctx.reply(resolved.error);
        setTimeout(() => ctx.api.deleteMessage(ctx.chat!.id, msg.message_id).catch(() => {}), 5000);
        return;
    }

    try {
        await ctx.api.unbanChatMember(ctx.chat!.id, resolved.targetUserId!);
        await ctx.reply(`🙂 <b>${resolved.displayName}</b> đã được ân xá`, { parse_mode: 'HTML' });
    } catch (error) {
        await ctx.reply('⚠️ Lỗi: Không thể Unban người này.');
    }
});

// Start bot
BOT_TOKEN.start({
    onStart: (botInfo) => {
        console.log(`✅ Bot @${botInfo.username} đã khởi động!!`);
    }
});