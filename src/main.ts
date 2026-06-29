import { Bot, Context } from "grammy";
import * as dotenv from "dotenv";
import * as path from "path";
import { fileURLToPath } from "url";

// Cấu hình để đọc file .env từ thư mục gốc
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const bot = new Bot(process.env.BOT_TOKEN || "");

// ID của bạn (Dùng bot @userinfobot để lấy ID Telegram của bạn)
const ADMIN_IDS = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',').map(Number) : [];

console.log("Danh sách Admin ID:", ADMIN_IDS);
bot.command("start", (ctx) => ctx.reply("Bot quản trị đã sẵn sàng!"));

bot.command("promote", async (ctx) => {
    // 1. Bảo mật: Chỉ chủ nhân (MY_ID) mới được dùng lệnh này
    if (!ADMIN_IDS.includes(ctx.from?.id || 0)) {
        // Gửi tin nhắn cảnh báo
        const msg = await ctx.reply("Bạn không có quyền sử dụng lệnh này!");

        // Tự động xóa sau 60000ms (60 giây)
        setTimeout(async () => {
            try {
                await ctx.api.deleteMessage(ctx.chat.id, msg.message_id);
            } catch (e) {
                console.error("Không thể xóa tin nhắn:", e);
            }
        }, 60000);

        return; // Kết thúc lệnh
    }

    // 2. Kiểm tra xem có đang reply tin nhắn không
    const repliedMessage = ctx.message?.reply_to_message;
    if (!repliedMessage) {
        return ctx.reply("Hãy reply tin nhắn của người bạn muốn cấp quyền admin với lệnh /promote");
    }

    // 3. Lấy ID người dùng và ép kiểu về number
    const userId = repliedMessage.from?.id;
    if (!userId) return ctx.reply("Không tìm thấy ID người dùng.");

    try {
        // 4. Cấp quyền Admin
        await bot.api.promoteChatMember(
            ctx.chat.id,    // Tham số 1: Chat ID
            userId as number, // Tham số 2: User ID
            {               // Tham số 3: Object các quyền
                can_manage_chat: true,
                can_post_messages: true,
                can_edit_messages: true,
                can_delete_messages: true,
                can_restrict_members: true,
                can_promote_members: true,
                can_change_info: true,
                can_invite_users: true,
                can_pin_messages: true,
                can_manage_video_chats: true,
                can_manage_topics: false,      // Thêm nếu group có Topics
                can_post_stories: true,       // Quyền đăng Stories (cái bạn đang cần)
                can_edit_stories: true,       // Quyền sửa Stories
                can_delete_stories: true,     // Quyền xóa Stories
                is_anonymous: true
            }
        );

        ctx.reply(`Đã phong chức Admin cho @${repliedMessage.from?.username || userId}`);
    } catch (e) {
        console.error(e);
        ctx.reply("Lỗi: Hãy chắc chắn bot đã là Admin trong group và có quyền 'Thêm quản trị viên mới'.");
    }
});

bot.command("demote", async (ctx) => {
    // 1. Bảo mật: Chỉ chủ nhân (ADMIN_IDS) mới được dùng lệnh này
    if (!ADMIN_IDS.includes(ctx.from?.id || 0)) {
        // Gửi tin nhắn cảnh báo
        const msg = await ctx.reply("Bạn không có quyền sử dụng lệnh này!");

        // Tự động xóa sau 60000ms (60 giây)
        setTimeout(async () => {
            try {
                await ctx.api.deleteMessage(ctx.chat.id, msg.message_id);
            } catch (e) {
                console.error("Không thể xóa tin nhắn:", e);
            }
        }, 60000);

        return; // Kết thúc lệnh
    }

    // 2. Kiểm tra xem có đang reply tin nhắn không
    const repliedMessage = ctx.message?.reply_to_message;
    if (!repliedMessage) {
        return ctx.reply("Hãy reply tin nhắn của người bạn muốn gỡ quyền admin với lệnh /demote");
    }

    const userId = repliedMessage.from?.id;
    if (!userId) return ctx.reply("Không tìm thấy ID người dùng.");

    try {
        // 3. Tước quyền Admin bằng cách đặt tất cả về false
        await bot.api.promoteChatMember(
            ctx.chat.id,
            userId as number,
            {
                can_manage_chat: false,
                can_post_messages: false,
                can_edit_messages: false,
                can_delete_messages: false,
                can_restrict_members: false,
                can_promote_members: false,
                can_change_info: false,
                can_invite_users: false,
                can_pin_messages: false,
                can_manage_video_chats: false,
                can_manage_topics: false,
                can_post_stories: false,
                can_edit_stories: false,
                can_delete_stories: false,
                is_anonymous: false
            }
        );

        ctx.reply(`Đã gỡ quyền Admin của @${repliedMessage.from?.username || userId}`);
    } catch (e) {
        console.error(e);
        ctx.reply("Lỗi: Bot không thể gỡ quyền. Hãy chắc chắn bot vẫn là Admin trong group.");
    }
});

bot.command("checkrights", async (ctx) => {
    if (!ADMIN_IDS.includes(ctx.from?.id || 0)) {
        // Gửi tin nhắn cảnh báo
        const msg = await ctx.reply("Bạn không có quyền sử dụng lệnh này!");

        // Tự động xóa sau 60000ms (60 giây)
        setTimeout(async () => {
            try {
                await ctx.api.deleteMessage(ctx.chat.id, msg.message_id);
            } catch (e) {
                console.error("Không thể xóa tin nhắn:", e);
            }
        }, 60000);

        return; // Kết thúc lệnh
    }
    // 1. Kiểm tra xem bot có phải là admin trong group không
    try {
        // Lấy thông tin của chính con bot trong group
        const botMember = await bot.api.getChatMember(ctx.chat.id, bot.botInfo.id);

        if (botMember.status !== "administrator") {
            return ctx.reply("Bot chưa được cấp quyền Admin trong group này!");
        }

        // 2. Liệt kê các quyền mà bot đang có
        const rights = botMember;
        let response = "📋 **Quyền hạn hiện tại của Bot trong group:**\n";

        // Danh sách các quyền cần check
        const permissionMap: { [key: string]: string } = {
            can_manage_chat: "Quản lý nhóm",
            can_delete_messages: "Xóa tin nhắn",
            can_restrict_members: "Chặn thành viên",
            can_promote_members: "Thêm quản trị viên mới",
            can_change_info: "Thay đổi thông tin nhóm",
            can_invite_users: "Mời thành viên",
            can_pin_messages: "Ghim tin nhắn",
            can_manage_video_chats: "Quản lý video chat",
            can_manage_topics: "Quản lý chủ đề",
            can_post_stories: "Đăng Stories",
            can_edit_stories: "Sửa Stories",
            can_delete_stories: "Xóa Stories"
        };

        for (const [key, label] of Object.entries(permissionMap)) {
            // Kiểm tra xem quyền đó có trong object quyền của bot không
            const hasRight = (rights as any)[key] === true;
            response += `${hasRight ? "✅" : "❌"} ${label}\n`;
        }

        ctx.reply(response, { parse_mode: "Markdown" });
    } catch (e) {
        ctx.reply("Lỗi: Bot không thể đọc quyền hạn trong group này.");
    }
});

bot.command("help", async (ctx) => {
    if (!ADMIN_IDS.includes(ctx.from?.id || 0)) {
        // Gửi tin nhắn cảnh báo
        const msg = await ctx.reply("Bạn không có quyền sử dụng lệnh này!");

        // Tự động xóa sau 60000ms (60 giây)
        setTimeout(async () => {
            try {
                await ctx.api.deleteMessage(ctx.chat.id, msg.message_id);
            } catch (e) {
                console.error("Không thể xóa tin nhắn:", e);
            }
        }, 60000);

        return; // Kết thúc lệnh
    }

    const helpMessage = `
🤖 **Danh sách lệnh quản trị của Bot:**

1. /start - Kiểm tra trạng thái bot.
2. /promote - Reply tin nhắn người cần cấp quyền Admin (full quyền).
3. /demote - Reply tin nhắn người cần gỡ quyền Admin.
4. /checkrights - Kiểm tra các quyền hạn mà Bot hiện đang sở hữu trong group.
5. /help - Hiển thị bảng hướng dẫn này.

⚠️ **Lưu ý:** 
- Bạn cần Reply tin nhắn của thành viên khi dùng /promote hoặc /demote.
- Bot chỉ thực hiện lệnh nếu bạn nằm trong danh sách Admin được chỉ định.
`;
    ctx.reply(helpMessage, { parse_mode: "Markdown" });
});

bot.start();
console.log("Bot đang chạy...");