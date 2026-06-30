import { Bot, Context } from "grammy";
import * as dotenv from "dotenv";
import * as path from "path";
import { fileURLToPath } from "url";
import express from "express"; // Import express

// Setting to read file .env
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const bot = new Bot(process.env.BOT_TOKEN || "");

// Create Web Server
const app = express();
const PORT = process.env.PORT || 8080;

// Create route "/" 
app.get("/", (req, res) => {
    res.send("Bot Telegram đang hoạt động 24/7!");
});

// Listening port in web
app.listen(PORT, () => {
    console.log(`✅ Web server đã mở trên port ${PORT} để giữ Render không ngủ.`);
});

// Get ID Admin
const ADMIN_IDS = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',').map(Number) : [];

// ==================================================================
// Add, edit, delete Admin Permission
// ==================================================================
bot.command("start", (ctx) => ctx.reply("Muốn xem thử Bot làm được gì không? Ấn `/help` đi là biết 😏"));

bot.command("promote", async (ctx) => {
    // 1. Kiểm tra quyền Admin
    if (!ADMIN_IDS.includes(ctx.from?.id || 0)) {
        const msg = await ctx.reply("Bạn không có quyền sử dụng lệnh này!");
        setTimeout(() => ctx.api.deleteMessage(ctx.chat.id, msg.message_id).catch(console.error), 60000);
        return;
    }

    // 2. Xác định ID người cần promote
    let userId: number | string | undefined;
    let usernameOrId: string | undefined;

    // Ưu tiên 1: Reply tin nhắn
    if (ctx.message?.reply_to_message) {
        userId = ctx.message.reply_to_message.from?.id;
    } 
    // Ưu tiên 2: Gõ ID hoặc @username ở tham số lệnh (Ví dụ: /promote 123456 hoặc /promote @user)
    else {
        const args = ctx.message?.text?.split(" ");
        if (args && args.length > 1) {
            usernameOrId = args[1];
            // Nếu là @username thì giữ nguyên string, nếu là số thì ép kiểu number
            userId = isNaN(Number(usernameOrId)) ? usernameOrId : Number(usernameOrId);
        }
    }

    if (!userId) {
        return ctx.reply("Cú pháp: Reply tin nhắn hoặc gõ /promote [ID hoặc @username]");
    }

    try {
        // 3. Thực hiện phong chức
        await bot.api.promoteChatMember(
            ctx.chat.id,
            userId as number, // telegram api chấp nhận cả number hoặc username string
            {
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
            }
        );

        ctx.reply(`Đã phong chức Admin cho ${usernameOrId || "@" + ctx.message?.reply_to_message?.from?.username || userId}`);
    } catch (e) {
        console.error(e);
        ctx.reply("Lỗi: Hãy chắc chắn bot là Admin và có quyền 'Thêm quản trị viên mới'. Nếu dùng ID/Username, hãy chắc chắn người đó đang ở trong group.");
    }
});

bot.command("demote", async (ctx) => {
    // 1. Kiểm tra quyền Admin
    if (!ADMIN_IDS.includes(ctx.from?.id || 0)) {
        const msg = await ctx.reply("Bạn không có quyền sử dụng lệnh này!");
        setTimeout(() => ctx.api.deleteMessage(ctx.chat.id, msg.message_id).catch(console.error), 60000);
        return;
    }

    // 2. Xác định ID người cần demote
    let userId: number | string | undefined;
    let usernameOrId: string | undefined;

    // Ưu tiên 1: Reply tin nhắn
    if (ctx.message?.reply_to_message) {
        userId = ctx.message.reply_to_message.from?.id;
    } 
    // Ưu tiên 2: Gõ ID hoặc @username ở tham số lệnh
    else {
        const args = ctx.message?.text?.split(" ");
        if (args && args.length > 1) {
            usernameOrId = args[1];
            userId = isNaN(Number(usernameOrId)) ? usernameOrId : Number(usernameOrId);
        }
    }

    if (!userId) {
        return ctx.reply("Cú pháp: Reply tin nhắn hoặc gõ /demote [ID hoặc @username]");
    }

    try {
        // 3. Tước quyền (set tất cả về false)
        await bot.api.promoteChatMember(
            ctx.chat.id,
            userId as number,
            {
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
            }
        );

        ctx.reply(`Đã gỡ quyền Admin của ${usernameOrId || "@" + ctx.message?.reply_to_message?.from?.username || userId}`);
    } catch (e) {
        console.error(e);
        ctx.reply("Lỗi: Bot không thể tước quyền. Hãy chắc chắn bot là Admin và có quyền gỡ quản trị viên.");
    }
});

bot.command("uncheck", async (ctx) => {
    // 1. Kiểm tra Admin (như các lệnh khác)
    if (!ADMIN_IDS.includes(ctx.from?.id || 0)) return;

    // 2. Lấy nội dung lệnh (ví dụ: /uncheck anonymous)
    const args = ctx.message?.text?.split(" ");
    const targetRight = args?.[1]; // Ví dụ: 'anonymous', 'delete_messages', v.v.

    if (!targetRight || !ctx.message?.reply_to_message) {
        return ctx.reply("Cú pháp: Reply tin nhắn admin đó và dùng: `/uncheck [quyền]`\nCác quyền: anonymous, delete_messages, pin_messages, v.v.");
    }

    const userId = ctx.message.reply_to_message.from?.id;
    if (!userId) return ctx.reply("Không tìm thấy ID người dùng.");

    try {
        // 3. Lấy thông tin quyền hạn hiện tại của người đó
        const member = await ctx.api.getChatMember(ctx.chat.id, userId);

        // Nếu người đó không phải admin, không cần gỡ
        if (member.status !== "administrator") {
            return ctx.reply("Người này không phải là Admin.");
        }

        // 4. Mapping từ tên ngắn gọn sang tên quyền của Telegram API
        const rightMap: { [key: string]: string } = {
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

        const telegramRight = rightMap[targetRight.toLowerCase()];
        if (!telegramRight) return ctx.reply("Quyền không hợp lệ! Chỉ hỗ trợ: anonymous, [pin, post, edit, delete] message, manage, restrict, promote, info, invite, video, topics, stories, edit_stories, del_stories");

        // 5. Cập nhật quyền (giữ nguyên các quyền cũ, chỉ tắt quyền chỉ định)
        const currentRights = member as any;
        currentRights[telegramRight] = false;

        await ctx.api.promoteChatMember(ctx.chat.id, userId, currentRights);

        ctx.reply(`Đã tắt quyền '${targetRight}' của @${ctx.message.reply_to_message.from?.username || userId}`);
    } catch (e) {
        console.error(e);
        ctx.reply("Lỗi: Không thể cập nhật quyền. Bot cần là Admin và có quyền sửa Admin khác.");
    }
});

bot.command("check", async (ctx) => {
    // 1. Kiểm tra quyền Admin
    if (!ADMIN_IDS.includes(ctx.from?.id || 0)) return;

    // 2. Lấy danh sách quyền cần bật (tách bằng dấu phẩy)
    const args = ctx.message?.text?.split(" ");
    const helpMessage = `
🤖 **Danh sách lệnh quản trị:** 🤖

1. manage - Quyền admin.
2. info - Quyền chỉnh sửa thông tin group
3. delete,edit,post - Quyền xóa, sửa, gửi tin nhắn.
4. restrict - Hạn chế người dùng khác.
5. promote - Thêm Admin mới.
6. invite - Thêm người khác vào group.
7. video - Video Chat.
8. topics - Quyền topic (Dành cho nhóm Topic).
9. stories,edit_stories,del_stories - Quyền thêm, sửa, xóa stories.
10. anonymous - Chat ẩn danh.
`;
    if (!args?.[1] || !ctx.message?.reply_to_message) {
        return ctx.reply("Cú pháp: Reply tin nhắn người đó và dùng: `/check command`\n" + helpMessage);
    }


    const rightsToEnable = args[1].split(","); // Tách các quyền theo dấu phẩy
    const userId = ctx.message.reply_to_message.from?.id;
    if (!userId) return ctx.reply("Không tìm thấy ID người dùng.");

    try {
        const member = await ctx.api.getChatMember(ctx.chat.id, userId);
        if (member.status !== "administrator" && member.status !== "member") {
            return ctx.reply("Không thể cấp quyền cho người này.");
        }

        const rightMap: { [key: string]: string } = {
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

        // 3. Cập nhật quyền (bật tất cả các quyền được yêu cầu lên)
        // Tạo một object mới để giữ các quyền hiện tại hoặc quyền mặc định
        const updateRights: any = {}; 
        
        for (const right of rightsToEnable) {
            const telegramRight = rightMap[right.toLowerCase().trim()];
            if (telegramRight) {
                updateRights[telegramRight] = true;
            } else {
                return ctx.reply(`Quyền không hợp lệ: ${right}`);
            }
        }

        // Gọi promoteChatMember với các quyền đã chọn
        await ctx.api.promoteChatMember(ctx.chat.id, userId, updateRights);

        ctx.reply(`Đã BẬT các quyền: [${rightsToEnable.join(", ")}] cho @${ctx.message.reply_to_message.from?.username || userId}`);
    } catch (e) {
        console.error(e);
        ctx.reply("Lỗi: Không thể cấp quyền. Hãy đảm bảo Bot là Admin và có quyền bổ nhiệm người khác.");
    }
});

bot.command("checkrights", async (ctx) => {
    // 1. Kiểm tra quyền của chính ông (Admin)
    if (!ADMIN_IDS.includes(ctx.from?.id || 0)) {
        return ctx.reply("Bạn không có quyền check!");
    }

    // 2. Xác định đối tượng cần check
    let targetUserId: number | undefined;

    // Cách A: Reply vào tin nhắn của người cần check
    if (ctx.message?.reply_to_message) {
        targetUserId = ctx.message.reply_to_message.from?.id;
    }
    // Cách B: Gõ lệnh /checkrights @username hoặc ID
    else {
        const args = ctx.message?.text?.split(" ");

        if (args && args.length > 1) {
            const input = args[1];

            // Kiểm tra input có tồn tại và là chuỗi trước khi dùng
            if (input) {
                if (input.startsWith("@")) {
                    return ctx.reply("Vui lòng reply tin nhắn hoặc nhập chính xác ID của người đó.");
                }

                // Dùng Number() hoặc parseInt với input chắc chắn là string
                targetUserId = parseInt(input, 10);
            }
        }
    }

    if (!targetUserId) {
        // Nếu không có đối số nào, mặc định check quyền của chính con Bot (như code cũ của ông)
        // ... (Giữ nguyên logic cũ của ông ở đây nếu muốn check bot)
        return ctx.reply("Hãy reply tin nhắn của Admin cần check hoặc gõ /checkrights [ID]");
    }

    try {
        const member = await ctx.api.getChatMember(ctx.chat.id, targetUserId);

        if (member.status !== "administrator" && member.status !== "creator") {
            return ctx.reply("Người này không phải là Admin.");
        }

        let response = `📋 -----**Quyền hạn gồm:**-----\n`;

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
2. /promote - Reply tin nhắn người cần cấp quyền Admin (Hoặc ID).
3. /demote - Reply tin nhắn người cần gỡ quyền Admin (Hoặc ID).
4. /check, /uncheck - Thêm 1 số quyền thiếu của Admin
5. /checkrights + ID - Kiểm tra các quyền hạn mà Bot, Admin hiện đang sở hữu trong group.
6. /help - Hiển thị bảng hướng dẫn này.

⚠️ **Lưu ý:** 
- Bạn cần Reply tin nhắn của thành viên khi dùng /promote hoặc /demote.
- Bot chỉ thực hiện lệnh nếu bạn nằm trong danh sách Admin được chỉ định.
`;
    ctx.reply(helpMessage, { parse_mode: "Markdown" });
});
// ==================================================================



// 3. Run Bot
bot.start({
    onStart: (botInfo) => {
        console.log(`✅ Bot @${botInfo.username} đã khởi động!`);
    }
});