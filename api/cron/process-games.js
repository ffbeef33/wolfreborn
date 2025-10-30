// File: /api/cron/process-games.js
// Đây là endpoint được Vercel Cron Job gọi để xử lý vòng lặp game.

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { gameLoop } from '../game-engine.js'; // Import logic cốt lõi

// --- 1. KHỞI TẠO FIREBASE ADMIN (Singleton Pattern) ---

let firebaseAdminApp;

function getFirebaseAdmin() {
    if (!firebaseAdminApp) {
        if (getApps().length > 0) {
            firebaseAdminApp = getApps()[0];
        } else {
            try {
                // Đảm bảo các biến môi trường đã được đặt trên Vercel
                const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
                const databaseURL = process.env.FIREBASE_DATABASE_URL;
                firebaseAdminApp = initializeApp({
                    credential: cert(serviceAccount),
                    databaseURL: databaseURL,
                });
            } catch (e) {
                console.error("Lỗi Khởi Tạo Firebase Admin SDK trong Cron:", e);
                // Ném lỗi để Vercel ghi log
                throw new Error("Không thể khởi tạo Firebase Admin SDK.");
            }
        }
    }
    return firebaseAdminApp;
}

// --- 2. HÀM HELPER: LẤY CÁC PHÒNG ĐANG HOẠT ĐỘNG ---

/**
 * Lấy danh sách ID các phòng đang chơi (không phải 'waiting' hoặc 'GAME_END').
 * Hàm này truy vấn Firebase để tìm các phòng cần được xử lý.
 */
async function getActiveRoomIds() {
    try {
        const db = getDatabase(getFirebaseAdmin());
        const roomsRef = db.ref('rooms');
        // Sắp xếp và lọc các phòng có 'phase' đang hoạt động
        const snapshot = await roomsRef.orderByChild('gameState/phase').startAt('DAY_1_INTRO').endAt('VOTE_RESULT').once('value');
        
        const rooms = snapshot.val();
        if (!rooms) {
            return []; // Không có phòng nào đang hoạt động
        }

        // Lọc lại chính xác vì startAt/endAt có thể bao gồm các giá trị không mong muốn
        return Object.keys(rooms).filter(roomId => {
            const phase = rooms[roomId].gameState?.phase;
            return phase && phase !== 'waiting' && phase !== 'GAME_END';
        });

    } catch (error) {
        console.error("Lỗi khi lấy danh sách phòng hoạt động:", error);
        return []; // Trả về mảng rỗng nếu có lỗi
    }
}


// --- 3. HÀM HANDLER CHÍNH (CRON JOB ENDPOINT) ---

/**
 * Đây là hàm chính mà Vercel Cron Job sẽ gọi.
 */
export default async function handler(request, response) {
    // Chỉ cho phép request GET (từ Cron Job)
    if (request.method !== 'GET') {
        return response.status(405).json({ error: 'Method Not Allowed' });
    }
    
    // (Tùy chọn: Thêm một lớp bảo mật đơn giản, ví dụ: kiểm tra 'Authorization' header
    // mà Vercel Cron Job gửi kèm nếu bạn cấu hình 'Cron Secure Token')
    // const authToken = request.headers.get('authorization');
    // if (authToken !== `Bearer ${process.env.CRON_SECRET}`) {
    //     return response.status(401).json({ error: 'Unauthorized' });
    // }

    let activeRoomIds = [];
    try {
        // Lấy danh sách các phòng cần xử lý
        activeRoomIds = await getActiveRoomIds();
        
        if (activeRoomIds.length === 0) {
            return response.status(200).json({ message: 'Không có phòng nào đang hoạt động để xử lý.' });
        }

        // Xử lý song song các phòng
        // Promise.allSettled đảm bảo rằng ngay cả khi 1 phòng bị lỗi, các phòng khác vẫn được xử lý
        const results = await Promise.allSettled(
            activeRoomIds.map(roomId => gameLoop(roomId))
        );

        // Tạo tóm tắt kết quả
        const summary = results.map((res, index) => ({
            room: activeRoomIds[index],
            status: res.status, // 'fulfilled' hoặc 'rejected'
            data: res.status === 'fulfilled' ? res.value : res.reason.message
        }));

        console.log(`Cron Job: Đã xử lý ${activeRoomIds.length} phòng.`);
        return response.status(200).json({ message: 'Xử lý các phòng hoàn tất.', summary });

    } catch (error) {
        console.error('Lỗi nghiêm trọng trong Cron Job Handler:', error);
        return response.status(500).json({ 
            error: 'Lỗi máy chủ nội bộ.', 
            details: error.message,
            roomsProcessed: activeRoomIds 
        });
    }
}