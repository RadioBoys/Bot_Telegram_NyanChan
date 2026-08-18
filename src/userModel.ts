import pool from './db.js';

// Hàm lưu / cập nhật thông tin user vào bảng users_data
export const upsertUser = async (userId: number, username?: string, firstName?: string, lastName?: string) => {
    const fullName = `${firstName || ''} ${lastName || ''}`.trim();
    const cleanUsername = username ? username.replace('@', '') : null;
    const values = [userId, fullName || null, cleanUsername];

    const query = `
        INSERT INTO users_data (user_id, full_name, username, updated_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (user_id)
        DO UPDATE SET
            full_name = EXCLUDED.full_name,
            username = EXCLUDED.username,
            updated_at = NOW();
    `;

    try {
        await pool.query(query, values);
    } catch (error) {
        console.error('Không thể cập nhật user vào DB: ', error);
    }
};

// Hàm tra cứu displayName ưu tiên: full_name -> @username -> ID
export const getDisplayNameFromDB = async (userId: number, fallbackUsername?: string, fallbackFullName?: string): Promise<string> => {
    const query = `SELECT full_name, username FROM users_data WHERE user_id = $1`;
    try {
        const response = await pool.query(query, [userId]);
        if (response.rows.length > 0) {
            const user = response.rows[0];
            if (user.full_name && user.full_name.trim() !== '') {
                return user.full_name.trim();
            }
            if (user.username && user.username.trim() !== '') {
                return `@${user.username.replace('@', '')}`;
            }
        }
    } catch (error) {
        console.error('Lỗi khi lấy displayName từ DB:', error);
    }

    // Fallback nếu trong DB chưa kịp lưu hoặc chưa có dữ liệu
    if (fallbackFullName && fallbackFullName.trim() !== '') {
        return fallbackFullName.trim();
    }
    if (fallbackUsername && fallbackUsername.trim() !== '') {
        return `@${fallbackUsername.replace('@', '')}`;
    }
    return `ID ${userId}`;
};

// Hàm lấy ID từ username phục vụ tra cứu
export const getIdFromUsername = async (username: string): Promise<number | null> => {
    const cleanUsername = username.replace('@', '');
    const query = `SELECT user_id FROM users_data WHERE username = $1`;
    try {
        const response = await pool.query(query, [cleanUsername]);
        if (response.rows.length > 0) {
            return response.rows[0].user_id;
        }
        return null;
    } catch (error) {
        console.error('Lỗi tra cứu user trong DB: ', error);
        return null;
    }
};