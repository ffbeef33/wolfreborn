// File: /api/host-actions.js
// Xử lý tất cả hành động của Host (Tạo, Tham gia, Start, Kick...)
// === CẬP NHẬT: Thay đổi phương thức xác thực sang google.auth.fromJSON ===

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getDatabase, ServerValue } from 'firebase-admin/database';
// Import logic Google Sheets trực tiếp
import { google } from 'googleapis';
// Import setGamePhase từ game-engine (vẫn cần cái này)
import { setGamePhase } from './game-engine.js'; 

// --- BIẾN CACHE CỤC BỘ (CHỈ CHO FILE NÀY) ---
let rolesDataCache = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 phút

// --- 1. KHỞI TẠO FIREBASE ADMIN (Singleton Pattern) ---
let firebaseAdminApp;
function getFirebaseAdmin() {
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
            }, APP_NAME);
        } catch (e) {
            console.error("Lỗi Khởi Tạo Firebase Admin SDK (host-actions):", e);
            throw new Error("Không thể khởi tạo Firebase Admin SDK.");
        }
    }
    return firebaseAdminApp;
}

// --- LOGIC GOOGLE SHEET (ĐÃ SỬA LỖI) ĐƯỢC SAO CHÉP VÀO ĐÂY ---

// === BẢN VÁ: Thay đổi cách xác thực ===
/**
 * [CỤC BỘ] Khởi tạo và trả về Google Sheets API.
 * (Sử dụng google.auth.fromJSON)
 */
async function getGoogleSheetsAPI_local() {
    try {
        const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS);
        
        // Sử dụng phương thức fromJSON
        const auth = google.auth.fromJSON(credentials);
        auth.scopes = ['https://www.googleapis.com/auth/spreadsheets.readonly'];
        
        // Tạo đối tượng sheets với auth đã được chỉ định scope
        const sheetsApi = google.sheets({ version: 'v4', auth: auth });
        
        return sheetsApi;
        
    } catch (e) {
        console.error("Lỗi Khởi Tạo Google Sheets API (host-actions local):", e);
        throw new Error("Không thể khởi tạo Google Sheets API.");
    }
}
// === KẾT THÚC BẢN VÁ ===


/**
 * [CỤC BỘ] Đọc và cache dữ liệu từ Google Sheet.
 * (Vẫn giữ Debug Log)
 */
async function fetchSheetData_local(sheetName) {
    const now = Date.now();
    // Kiểm tra cache CỤC BỘ
    if (sheetName === 'Roles' && rolesDataCache && (now - cacheTimestamp < CACHE_DURATION)) {
        return rolesDataCache;
    }

    // === BƯỚC DEBUG: Khai báo biến trước khi try-catch ===
    let spreadsheetId = process.env.GOOGLE_SHEET_ID || "CHƯA XÁC ĐỊNH";
    let clientEmail = "CHƯA XÁC ĐỊNH";
    // === KẾT THÚC DEBUG ===

    try {
        // === BƯỚC DEBUG: Lấy thông tin email từ credentials ===
        try {
            const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS);
            clientEmail = credentials.client_email;
        } catch (e) {
            console.error("[HOST-ACTIONS DEBUG] Không thể parse GOOGLE_SERVICE_ACCOUNT_CREDENTIALS.");
        }
        // === KẾT THÚC DEBUG ===

        // === BẢN VÁ: Hàm này giờ sẽ gọi phiên bản fromJSON ===
        const sheets = await getGoogleSheetsAPI_local(); 
        spreadsheetId = process.env.GOOGLE_SHEET_ID;

        // === BƯỚC DEBUG: In thông tin trước khi gọi ===
        console.log(`[HOST-ACTIONS DEBUG] Đang thử đọc Sheet ID: ${spreadsheetId}`);
        console.log(`[HOST-ACTIONS DEBUG] Sử dụng Service Account: ${clientEmail}`);
        // === KẾT THÚC DEBUG ===

        const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: sheetName });
        const rows = res.data.values;

        if (!rows || rows.length <= 1) {
            throw new Error(`Không tìm thấy dữ liệu hoặc chỉ có tiêu đề trong sheet: ${sheetName}`);
        }

        const headers = rows[0].map(h => h.trim());
        const data = rows.slice(1);

        // Chỉ xử lý 'Roles' vì đây là file host-actions
        if (sheetName === 'Roles') {
            const rolesObj = {};
            data.forEach(row => {
                const role = {};
                headers.forEach((header, index) => {
                    role[header] = (row[index] !== undefined && row[index] !== null) ? String(row[index]) : '';
                });
                
                if (role.RoleName && role.RoleName.trim() !== "") {
                    rolesObj[role.RoleName.trim()] = role;
                }
            });
            rolesDataCache = rolesObj; // Lưu vào cache CỤC BỘ
            cacheTimestamp = now;
            return rolesDataCache;
        }

    } catch (error) {
        console.error(`Lỗi khi đọc sheet ${sheetName} (host-actions local):`, error.message);
        
        // === BƯỚC DEBUG: In lại thông tin khi gặp lỗi ===
        console.error(`[HOST-ACTIONS DEBUG] GẶP LỖI VỚI Sheet ID: ${spreadsheetId}`);
        console.error(`[HOST-ACTIONS DEBUG] GẶP LỖI VỚI Service Account: ${clientEmail}`);
        // === KẾT THÚC DEBUG ===
        
        // Trả về cache cũ nếu có lỗi, nếu không thì ném lỗi
        if (sheetName === 'Roles' && rolesDataCache) return rolesDataCache;
        throw error;
    }
}


// --- 2. HÀM XỬ LÝ CHÍNH ---
export default async function handler(request, response) {
    response.setHeader('Access-Control-Allow-Origin', '*'); 
    response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (request.method === 'OPTIONS') {
        return response.status(200).end();
    }

    if (request.method !== 'POST') {
        return response.status(405).json({ success: false, message: 'Method Not Allowed' });
    }

    const { action, username, roomId, password, isPrivate, playerId } = request.body;

    try {
        const db = getDatabase(getFirebaseAdmin());

        // --- 3. PHÂN LUỒNG HÀNH ĐỘNG ---
        switch (action) {
            
            case 'create-room': {
                const newRoomId = Math.random().toString(36).substring(2, 6).toUpperCase(); 
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
                        roles: [] 
                    }
                };

                await db.ref(`rooms/${newRoomId}`).set(newRoomData);
                return response.status(201).json({ success: true, roomId: newRoomId });
            }
            
            case 'join-room': {
                const roomRef = db.ref(`rooms/${roomId}`);
                const snapshot = await roomRef.once('value');
                if (!snapshot.exists()) {
                    throw new Error('Phòng không tồn tại.');
                }
                const roomData = snapshot.val();

                const playerExists = Object.values(roomData.players).some(p => p.username === username);

                if (playerExists) {
                    return response.status(200).json({ success: true, roomId: roomId });
                }

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
                        // SỬ DỤNG HÀM CỤC BỘ (ĐÃ SỬA LỖI)
                        await handleStartGame(db, roomId, players, rolesFromSettings); 
                        return response.status(200).json({ success: true, message: 'Game đã bắt đầu.' });
                        
                    case 'skip-phase':
                        await db.ref(`rooms/${roomId}/gameState/startTime`).set(0);
                        return response.status(200).json({ success: true, message: 'Đã skip phase.' });

                    case 'end-game':
                        await cleanupAndEndGame(db, roomId, players);
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
        // Trả về 400 (Bad Request) thay vì 500, vì lỗi này thường do Google Auth
        return response.status(400).json({ success: false, message: error.message });
    }
}

// --- 4. LOGIC PHỤ TRỢ (TRONG CÙNG FILE) ---

/**
 * Xử lý logic khi Host bắt đầu game
 * (Sử dụng hàm fetchSheetData_local)
 */
async function handleStartGame(db, roomId, players, rolesToAssign) {
    const playerIds = Object.keys(players);
    const playerCount = playerIds.length;
    
    // 1. Kiểm tra điều kiện
    if (playerCount < 4) throw new Error('Cần tối thiểu 4 người chơi để bắt đầu.');
    if (!rolesToAssign || rolesToAssign.length === 0) throw new Error('Host chưa chọn vai trò.');
    if (playerCount !== rolesToAssign.length) throw new Error(`Số người chơi (${playerCount}) không khớp số vai trò (${rolesToAssign.length}).`);
    
    // SỬ DỤNG HÀM CỤC BỘ (ĐÃ SỬA LỖI)
    const allRolesData = await fetchSheetData_local('Roles'); 
    
    const hasWolf = rolesToAssign.some(roleName => allRolesData[roleName]?.Faction === 'Bầy Sói');
    if (!hasWolf) throw new Error('Game phải có tối thiểu 1 vai trò thuộc Bầy Sói.');

    // 2. Trộn và phân vai
    const shuffledRoles = [...rolesToAssign];
    shuffledRoles.sort(() => Math.random() - 0.5); 
    
    const updates = {};
    
    playerIds.forEach((pId, index) => {
        const assignedRoleName = shuffledRoles[index];
        const roleData = allRolesData[assignedRoleName] || {};
        
        updates[`/players/${pId}/roleName`] = assignedRoleName;
        updates[`/players/${pId}/faction`] = roleData.Faction || 'Phe Dân'; 
        updates[`/players/${pId}/isAlive`] = true;
        updates[`/players/${pId}/state`] = {}; 
        updates[`/players/${pId}/originalRoleName`] = null; 
    });

    // 3. Bắt đầu phase đầu tiên (DAY_1_INTRO)
    updates['/gameState/phase'] = 'DAY_1_INTRO';
    updates['/gameState/startTime'] = ServerValue.TIMESTAMP; 
    updates['/gameState/duration'] = 15; 
    updates['/gameState/nightNumber'] = 1;
    updates['/gameSettings/roles'] = rolesToAssign;
    
    // Xóa log cũ (nếu có)
    updates['/privateData'] = null;
    updates['/publicData'] = null;

    await db.ref(`rooms/${roomId}`).update(updates);
}

/**
 * Xử lý logic Reset / Restart
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
        updates[`/players/${pId}/originalRoleName`] = null; 
        
        if (!keepRoles) { 
             updates[`/players/${pId}/roleName`] = null;
             updates[`/players/${pId}/faction`] = null;
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
        updates['/gameSettings/roles'] = [];
    }
    
    await db.ref(`rooms/${roomId}`).update(updates);
}

/**
 * Dọn dẹp state của người chơi và kết thúc game
 */
async function cleanupAndEndGame(db, roomId, players) {
    const updates = {};
    
    if (players) {
        Object.keys(players).forEach(pId => {
            updates[`/players/${pId}/state`] = {};
            updates[`/players/${pId}/originalRoleName`] = null;
        });
    }
    
    updates['/nightActions'] = null;
    updates['/votes'] = null;
    updates['/gameState/phase'] = 'GAME_END';
    updates['/gameState/startTime'] = ServerValue.TIMESTAMP;
    updates['/gameState/duration'] = 99999;
    updates['/gameState/nightNumber'] = 0;

    await db.ref(`rooms/${roomId}`).update(updates);
}