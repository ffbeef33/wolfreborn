// File: /api/room.js
// Sử dụng Firebase Admin SDK để đọc dữ liệu phòng từ Firebase RTDB
const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');

// --- Hàm lấy credentials Firebase từ biến môi trường ---
function getFirebaseCredentials() {
    if (!process.env.FIREBASE_SERVICE_ACCOUNT_KEY || !process.env.FIREBASE_DATABASE_URL) {
        throw new Error('Firebase credentials or Database URL are not set in environment variables.');
    }
    try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
        const databaseURL = process.env.FIREBASE_DATABASE_URL;
        return { serviceAccount, databaseURL };
    } catch (e) {
        console.error("Could not parse Firebase credentials JSON:", e);
        throw new Error('Could not parse Firebase service account key JSON.');
    }
}

// --- Khởi tạo Firebase Admin SDK (chỉ một lần) ---
try {
    if (!getApps().length) {
        const { serviceAccount, databaseURL } = getFirebaseCredentials();
        initializeApp({
            credential: cert(serviceAccount),
            databaseURL: databaseURL,
        });
        console.log("Firebase Admin SDK initialized successfully.");
    }
} catch (error) {
    console.error("Firebase admin initialization error:", error.stack);
    // Ghi log lỗi nhưng không chặn server khởi động nếu có thể
}


// --- Hàm xử lý chính ---
// Thay đổi thành module.exports nếu không dùng ES Modules hoặc dùng require
// export default async function handler(request, response) { // Dùng nếu cấu hình Vercel là ES Module
module.exports = async (request, response) => { // Dùng nếu cấu hình Vercel là CommonJS
    response.setHeader('Access-Control-Allow-Origin', '*'); // Cho phép CORS nếu cần
    response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (request.method === 'OPTIONS') {
        return response.status(200).end();
    }

    if (request.method !== 'GET') {
        return response.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        // Kiểm tra lại SDK đã khởi tạo chưa
        if (!getApps().length) {
             console.error("Firebase Admin SDK not initialized before handling request.");
             return response.status(500).json({ error: 'Firebase Admin SDK is not initialized.' });
        }

        const db = getDatabase();
        const roomsRef = db.ref('rooms');
        const snapshot = await roomsRef.once('value');
        const allRoomsData = snapshot.val();

        if (!allRoomsData) {
            return response.status(200).json([]); // Trả về mảng rỗng nếu không có phòng nào
        }

        // Lọc và định dạng lại dữ liệu phòng để gửi về client
        const activeRooms = Object.keys(allRoomsData)
            .map(roomId => {
                const roomData = allRoomsData[roomId];
                // Chỉ lấy những thông tin cần thiết cho Lobby
                return {
                    id: roomId,
                    isPrivate: roomData.isPrivate || false, // Thêm trường này
                    playerCount: roomData.players ? Object.keys(roomData.players).length : 0,
                    maxPlayers: roomData.maxPlayers || 0, // Có thể thêm maxPlayers nếu có
                    status: roomData.gameState?.phase || 'waiting', // Lấy trạng thái game
                    createdAt: roomData.createdAt || 0, // Giữ lại để sắp xếp nếu cần
                };
            })
             // Có thể lọc bỏ những phòng đã kết thúc nếu cần
            .filter(room => room.status !== 'GAME_END')
            // Sắp xếp theo thời gian tạo, mới nhất lên đầu
            .sort((a, b) => b.createdAt - a.createdAt);

        return response.status(200).json(activeRooms);

    } catch (error) {
        console.error('API /api/room Error:', error);
        return response.status(500).json({ error: 'Lỗi máy chủ khi lấy danh sách phòng.', details: error.message });
    }
};