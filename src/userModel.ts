import pool from './db.js';

export const upsertUser = async (userId: number, username?: string, firstname?: string, lastName?: string) => {
    const fullName = `${firstname} ${lastName}`.trim();
    const values = [userId, username || null, fullName || ''];

    const query = `
        INSERT INTO users (user_id, username, first_name, updated_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (user_id)
        DO UPDATE SET
            username = EXCLUDED.username,
            first_name = EXCLUDED.first_name,
            updated_at = NOW()
    `

    try {
        await pool.query(query, values);
    } catch (error) {
        console.error('Khong the them user vao DB: ', error);
    }

}

export const getIdFromUsername = async (username: string): Promise<number | null> => {
    const cleanUsername = username.replace('@', '');
    const query = `SELECT user_id FROM users WHERE username = $1`;

    try {
        const response = await pool.query(query, [cleanUsername]);
        if (response.rows.length > 0) {
            return response.rows[0].user_id;
        } else {
            return null;
        }
    } catch (error) {
        console.error('Loi tra cuu user trong DB : ', error);
        return null;
    }
}
