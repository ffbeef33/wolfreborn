// File: /api/trigger-loop.js
// SỬ DỤNG CÚ PHÁP ESM (import/export)

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
// Sửa đường dẫn import cho đúng
import { gameLoop } from './game-engine.js'; 

// --- 1. KHỞI TẠO FIREBASE ADMIN (Singleton Pattern) ---
let firebaseAdminApp;
function getFirebaseAdmin() {
    // Đặt tên riêng cho instance này để tránh xung đột
    const APP_NAME = 'firebaseAdminTriggerLoop';
    
    if (getApps().find(app => app.name === APP_NAME)) {
        firebaseAdminApp = getApps().find(app => app.name === APP_NAME);
    } else {
        try {
            const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
            const databaseURL = process.env.FIREBASE_DATABASE_URL;
            firebaseAdminApp = initializeApp({
                credential: cert(serviceAccount),
                databaseURL: databaseURL,
            }, APP_NAME); // Đặt tên riêng
        } catch (e) {
            console.error("Lỗi Khởi Tạo Firebase Admin SDK (trigger-loop):", e);
            throw new Error("Không thể khởi tạo Firebase Admin SDK.");
        }
    }
    return firebaseAdminApp;
}


// --- 2. HÀM XỬ LÝ CHÍNH ---
export default async function handler(request, response) {
    // Cấu hình CORS
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (request.method === 'OPTIONS') {
        return response.status(200).end();
    }

    if (request.method !== 'POST') {
        return response.status(405).json({ success: false, message: 'Method Not Allowed' });
    }

    const { roomId } = request.body;
    if (!roomId) {
        return response.status(400).json({ success: false, message: 'Thiếu roomId.' });
    }

    try {
        getFirebaseAdmin(); // Đảm bảo đã khởi tạo
        
        // Gọi thẳng vào game engine để xử lý phòng này
        const result = await gameLoop(roomId);
        
        return response.status(200).json({ success: true, message: `Đã trigger loop cho phòng ${roomId}.`, result });

    } catch (error) {
        console.error(`Lỗi API /api/trigger-loop (Phòng ${roomId}):`, error);
        return response.status(500).json({ success: false, message: error.message });
    }
}