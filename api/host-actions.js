// File: /api/host-actions.js
// Xử lý tất cả hành động của Host (Tạo, Tham gia, Start, Kick...)

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getDatabase, ServerValue } from 'firebase-admin/database';
import { fetchSheetData, setGamePhase } from './game-engine.js'; 

// --- 1. KHỞI TẠO FIREBASE ADMIN (Singleton Pattern) ---
let firebaseAdminApp;
function getFirebaseAdmin() {
    // Đặt tên riêng cho instance này để tránh xung đột
    const APP_NAME = 'firebaseAdminHostActions';
    
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
            console.error("Lỗi Khởi Tạo Firebase Admin SDK (host-actions):", e);
            throw new Error("Không thể khởi tạo Firebase Admin SDK.");
        }
    }
    return firebaseAdminApp;
}

// --- 2. HÀM XỬ LÝ CHÍNH ---
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

    // Tách 'roles' ra khỏi đây vì nó không còn được dùng từ body
    const { action, username, roomId, password, isPrivate, playerId } = request.body;

    try {
        const db = getDatabase(getFirebaseAdmin());

        // --- 3. PHÂN LUỒNG HÀNH ĐỘNG ---
        switch (action) {
            
            // === TẠO PHÒNG ===
            case 'create-room': {
                const newRoomId = Math.random().toString(36).substring(2, 6).toUpperCase(); // 4 ký tự
                const hostPlayerId = `player_${Math.random().toString(36).substring(2, 9)}`;

                const newRoomData = {
                    roomId: newRoomId,
                    hostId: hostPlayerId,
                    isPrivate: isPrivate || false,
                    password: (isPrivate && password) ? password : null,
                    createdAt: ServerValue.TIMESTAMP, 
                    gameState: {
                        phase: 'waiting',
                        duration: 99999,
                        startTime: ServerValue.TIMESTAMP 
                    },
                    players: {
                        [hostPlayerId]: {
                            username: username,
                            isAlive: true,
                            isHost: true,
                            state: {}
                        }
                    },
                    gameSettings: {
                        roles: [] // Host sẽ cập nhật sau
                    }
                };

                await db.ref(`rooms/${newRoomId}`).set(newRoomData);
                return response.status(201).json({ success: true, roomId: newRoomId });
            }
            
            // === THAM GIA PHÒNG ===
            case 'join-room': {
                const roomRef = db.ref(`rooms/${roomId}`);
                const snapshot = await roomRef.once('value');
                if (!snapshot.exists()) {
                    throw new Error('Phòng không tồn tại.');
                }
                const roomData = snapshot.val();

                // --- *** LOGIC RECONNECT ĐÃ SỬA *** ---

                // 1. Kiểm tra xem người chơi đã ở trong phòng (đang reconnect)
                const playerExists = Object.values(roomData.players).some(p => p.username === username);

                if (playerExists) {
                    // Người chơi này đang kết nối lại (reconnecting).
                    // Không cần kiểm tra phase hay mật khẩu, chỉ cần cho họ vào.
                    return response.status(200).json({ success: true, roomId: roomId });
                }

                // 2. Nếu không, đây là người chơi MỚI. Áp dụng logic cũ.
                if (roomData.gameState.phase !== 'waiting') {
                    throw new Error('Game đã bắt đầu, không thể tham gia.');
                }
                
                if (roomData.isPrivate && roomData.password !== password) {
                    throw new Error('Mật khẩu phòng không chính xác.');
                }

                const newPlayerId = `player_${Math.random().toString(36).substring(2, 9)}`;
                await db.ref(`rooms/${roomId}/players/${newPlayerId}`).set({
                    username: username,
                    isAlive: true,
                    isHost: false,
                    state: {}
                });
                
                return response.status(200).json({ success: true, roomId: roomId });
            }

            // === HÀNH ĐỘNG CỦA HOST (CẦN XÁC THỰC) ===
            default: {
                
                const roomRef = db.ref(`rooms/${roomId}`);
                const roomSnapshot = await roomRef.once('value'); 
                if (!roomSnapshot.exists()) {
                    throw new Error('Phòng không tồn tại.');
                }
                const roomData = roomSnapshot.val();
                
                const hostId = roomData.hostId;
                const players = roomData.players || {};
                const gameSettings = roomData.gameSettings || {}; 
                
                const matchingPlayerId = Object.keys(players).find(pId => players[pId].username === username);

                if (!matchingPlayerId || matchingPlayerId !== hostId) {
                    throw new Error('Bạn không phải Host, không có quyền thực hiện hành động này.');
                }

                // Xử lý các hành động của Host
                switch (action) {
                    
                    case 'kick-player':
                        if (playerId === hostId) throw new Error("Host không thể tự kick mình.");
                        await db.ref(`rooms/${roomId}/players/${playerId}`).remove();
                        return response.status(200).json({ success: true, message: 'Đã kick người chơi.' });

                    case 'start-game':
                        const rolesFromSettings = gameSettings.roles || []; 
                        await handleStartGame(db, roomId, players, rolesFromSettings); 
                        return response.status(200).json({ success: true, message: 'Game đã bắt đầu.' });
                        
                    case 'skip-phase':
                        await db.ref(`rooms/${roomId}/gameState/startTime`).set(0);
                        return response.status(200).json({ success: true, message: 'Đã skip phase.' });

                    case 'end-game':
                        await setGamePhase(roomId, 'GAME_END', 99999, 0);
                        return response.status(200).json({ success: true, message: 'Đã kết thúc game.' });
                    
                    case 'delete-room':
                        await db.ref(`rooms/${roomId}`).remove();
                        return response.status(200).json({ success: true, message: 'Đã xóa phòng.' });

                    case 'reset-game': // Thiết lập lại
                        await resetGame(db, roomId, false); // false = giữ người chơi
                        return response.status(200).json({ success: true, message: 'Đã reset game.' });

                    case 'restart-game': // Khởi động lại
                        await resetGame(db, roomId, true); // true = giữ người chơi VÀ vai trò
                        return response.status(200).json({ success: true, message: 'Đã khởi động lại game.' });

                    default:
                        throw new Error('Hành động không xác định.');
                }
            }
        }

    } catch (error) {
        console.error(`Lỗi API /api/host-actions (action: ${action}):`, error);
        return response.status(400).json({ success: false, message: error.message });
    }
}

// --- 4. LOGIC PHỤ TRỢ (TRONG CÙNG FILE) ---

/**
 * Xử lý logic khi Host bắt đầu game
 * *** ĐÃ SỬA LỖI 1: Không xáo trộn mảng gốc ***
 */
async function handleStartGame(db, roomId, players, rolesToAssign) {
    const playerIds = Object.keys(players);
    const playerCount = playerIds.length;
    
    // 1. Kiểm tra điều kiện
    if (playerCount < 4) throw new Error('Cần tối thiểu 4 người chơi để bắt đầu.');
    if (!rolesToAssign || rolesToAssign.length === 0) throw new Error('Host chưa chọn vai trò.');
    if (playerCount !== rolesToAssign.length) throw new Error(`Số người chơi (${playerCount}) không khớp số vai trò (${rolesToAssign.length}).`);
    
    const allRolesData = await fetchSheetData('Roles'); 
    const hasWolf = rolesToAssign.some(roleName => allRolesData[roleName]?.Faction === 'Bầy Sói');
    if (!hasWolf) throw new Error('Game phải có tối thiểu 1 vai trò thuộc Bầy Sói.');

    // 2. Trộn và phân vai
    
    // *** SỬA LỖI 1 (Giữ nguyên) ***
    // Tạo một bản sao của mảng roles để xáo trộn
    const shuffledRoles = [...rolesToAssign];
    shuffledRoles.sort(() => Math.random() - 0.5); 
    
    const updates = {};
    
    playerIds.forEach((pId, index) => {
        const assignedRoleName = shuffledRoles[index]; // Lấy từ mảng đã xáo trộn
        const roleData = allRolesData[assignedRoleName] || {};
        
        updates[`/players/${pId}/roleName`] = assignedRoleName;
        updates[`/players/${pId}/faction`] = roleData.Faction || 'Phe Dân'; 
        updates[`/players/${pId}/isAlive`] = true;
        updates[`/players/${pId}/state`] = {}; 
    });

    // 3. Bắt đầu phase đầu tiên (DAY_1_INTRO)
    updates['/gameState/phase'] = 'DAY_1_INTRO';
    updates['/gameState/startTime'] = ServerValue.TIMESTAMP; 
    updates['/gameState/duration'] = 15; 
    updates['/gameState/nightNumber'] = 1;
    
    // Lưu lại mảng roles GỐC (chưa xáo trộn)
    updates['/gameSettings/roles'] = rolesToAssign; 
    
    // Xóa log cũ (nếu có)
    updates['/privateData'] = null;
    updates['/publicData'] = null;

    await db.ref(`rooms/${roomId}`).update(updates);
}

/**
 * Xử lý logic Reset / Restart
 * *** ĐÃ SỬA LỖI 2 (Theo yêu cầu): Khôi phục việc xóa vai trò ***
 */
async function resetGame(db, roomId, keepRoles) {
    const roomRef = db.ref(`rooms/${roomId}`);
    const snapshot = await roomRef.once('value');
    if (!snapshot.exists()) return;
    const roomData = snapshot.val();

    const updates = {};
    
    Object.keys(roomData.players).forEach(pId => {
        updates[`/players/${pId}/isAlive`] = true;
        updates[`/players/${pId}/causeOfDeath`] = null;
        updates[`/players/${pId}/state`] = {};
        if (!keepRoles) { 
             updates[`/players/${pId}/roleName`] = null;
             updates[`/players/${pId}/faction`] = null;
             updates[`/players/${pId}/originalRoleName`] = null;
        }
    });

    updates['/nightActions'] = null;
    updates['/votes'] = null;
    updates['/publicData'] = null;
    updates['/privateData'] = null;
    updates['/chat'] = null;
    
    if (keepRoles && roomData.gameSettings?.roles) {
        // Đây là logic "Restart" (Khởi động lại)
        await handleStartGame(db, roomId, roomData.players, roomData.gameSettings.roles);
    } else {
        // Đây là logic "Reset" (Thiết lập lại)
        updates['/gameState/phase'] = 'waiting';
        updates['/gameState/startTime'] = ServerValue.TIMESTAMP; 
        updates['/gameState/duration'] = 99999;
        
        // *** BẮT ĐẦU SỬA LỖI 2 (Theo yêu cầu) ***
        // Thêm lại dòng này để buộc Host chọn lại vai trò
        updates['/gameSettings/roles'] = []; 
        // *** KẾT THÚC SỬA LỖI 2 ***
    }
    
    await db.ref(`rooms/${roomId}`).update(updates);
}