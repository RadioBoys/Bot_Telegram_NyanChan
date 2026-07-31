import { Pool } from 'pg';
import 'dotenv/config';

// Create pool of DB
const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

// Check DB
export const connectDB = async () => {
    try {
        const client = await pool.connect();
        console.log("Connect DB successfully");
        client.release();
    } catch (error) {
        console.error('Loi Connect DB: ', error);
    }
}

connectDB();
export default pool;
