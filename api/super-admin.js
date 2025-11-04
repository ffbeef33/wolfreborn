// File: /api/super-admin.js
// API riêng cho Super Admin, yêu cầu mật khẩu SA mỗi lần gọi

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';

// --- 1. KHỞI TẠO FIREBASE ADMIN (Singleton Pattern) ---
let firebaseAdminApp;
function getFirebaseAdmin() {
    const APP_NAME = 'firebaseAdminSuperAdmin';
    
    if (getApps().find(app => app.name === APP_NAME)) {
        firebaseAdminApp = getApps().find(app => app.name === APP_NAME);
    } else {
        try {
            const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
            const databaseURL = process.env.FIREBASE_DATABASE_URL;
            firebaseAdminApp = initializeApp({
                credential: cert(serviceAccount),
                databaseURL: databaseURL,
            }, APP_NAME);
        } catch (e) {
            console.error("Lỗi Khởi Tạo Firebase Admin SDK (super-admin):", e);
            throw new Error("Không thể khởi tạo Firebase Admin SDK.");
        }
    }
    return firebaseAdminApp;
}

// --- 2. HÀM XÁC THỰC SUPER ADMIN ---
function authenticateSuperAdmin(password) {
    const superAdminPassword = process.env.SUPER_ADMIN_PASSWORD;
    
    if (!superAdminPassword) {
        throw new Error('Mật khẩu Super Admin chưa được cấu hình trên server.');
    }
    if (password !== superAdminPassword) {
        throw new Error('Xác thực Super Admin thất bại (Mật khẩu không đúng).');
    }
    // Xác thực thành công
    return true;
}

// --- 3. HÀM XỬ LÝ CHÍNH ---
export default async function handler(request, response) {
    // Cấu hình CORS
    response.setHeader('Access-Control-Allow-Origin', '*'); // Hoặc domain của bạn
    response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (request.method === 'OPTIONS') {
        return response.status(200).end();
    }

    if (request.method !== 'POST') {
        return response.status(405).json({ success: false, message: 'Method Not Allowed' });
    }

    const { action, roomId, password } = request.body;

    try {
        // Bước 1: Luôn xác thực mật khẩu SA
        authenticateSuperAdmin(password);

        // Bước 2: Khởi tạo DB
        const db = getDatabase(getFirebaseAdmin());

        // Bước 3: Thực hiện hành động
        switch (action) {
            case 'delete-room':
                if (!roomId) {
                    throw new Error('Thiếu thông tin "roomId".');
                }
                
                const roomRef = db.ref(`rooms/${roomId}`);
                const snapshot = await roomRef.once('value');

                if (!snapshot.exists()) {
                     return response.status(404).json({ success: false, message: `Phòng ${roomId} không tồn tại.` });
                }

                await roomRef.remove();
                return response.status(200).json({ success: true, message: `Đã xóa phòng ${roomId}.` });

            // (Bạn có thể thêm các case khác ở đây trong tương lai, vd: 'kick-player', 'end-game'...)

            default:
                throw new Error('Hành động không xác định.');
        }

    } catch (error) {
        console.error(`Lỗi API /api/super-admin (action: ${action}):`, error);
        // Trả về 401 (Unauthorized) nếu lỗi là do xác thực
        if (error.message.includes('Xác thực')) {
            return response.status(401).json({ success: false, message: error.message });
        }
        // Trả về 400 cho các lỗi logic khác
        return response.status(400).json({ success: false, message: error.message });
    }
}