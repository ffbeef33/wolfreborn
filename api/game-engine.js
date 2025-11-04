// File: /api/game-engine.js
// Đây là THƯ VIỆN LOGIC GAME, chạy trên backend (Node.js).
// Nó KHÔNG phải là một endpoint API, mà chỉ export các hàm.

import { google } from 'googleapis';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getDatabase, ServerValue } from 'firebase-admin/database';

// --- BIẾN TOÀN CỤC (CACHE) ---
let firebaseAdminApp;

// *** SỬA LỖI: Quay lại dùng Singleton Pattern (như code cũ) cho Google API ***
let googleAuth;
let sheetsApi;

let rolesDataCache = null;
let mechanicDataCache = null;
let cacheTimestamp = 0;

const CACHE_DURATION = 5 * 60 * 1000; // 5 phút

// --- 1. KHỞI TẠO DỊCH VỤ (Singleton Pattern) ---

/**
 * Khởi tạo và trả về Firebase Admin App (chỉ một lần).
 */
function getFirebaseAdmin() {
    // Đặt tên riêng cho instance này để tránh xung đột
    const APP_NAME = 'firebaseAdminGameEngine';
    
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
            console.error("Lỗi Khởi Tạo Firebase Admin SDK (game-engine):", e);
            throw new Error("Không thể khởi tạo Firebase Admin SDK.");
        }
    }
    return firebaseAdminApp;
}

/**
 * Khởi tạo và trả về Google Sheets API (Singleton Pattern - Giống code cũ).
 */
async function getGoogleSheetsAPI() {
    // *** SỬA LỖI: Quay lại dùng Singleton Pattern (như code cũ) ***
    if (!sheetsApi) {
        try {
            const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS);
            googleAuth = new google.auth.GoogleAuth({
                credentials,
                scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
            });
            sheetsApi = google.sheets({ version: 'v4', auth: googleAuth });
        } catch (e) {
            console.error("Lỗi Khởi Tạo Google Sheets API:", e);
            throw new Error("Không thể khởi tạo Google Sheets API.");
        }
    }
    return sheetsApi;
}

// --- 2. HÀM TRUY CẬP DỮ LIỆU (Với Cache) ---

/**
 * Đọc và cache dữ liệu từ Google Sheet.
 */
export async function fetchSheetData(sheetName) {
    const now = Date.now();
    // Kiểm tra cache (CACHE NỘI BỘ, KHÔNG PHẢI CACHE API)
    if (sheetName === 'Roles' && rolesDataCache && (now - cacheTimestamp < CACHE_DURATION)) {
        return rolesDataCache;
    }
    if (sheetName === 'Mechanic' && mechanicDataCache && (now - cacheTimestamp < CACHE_DURATION)) {
        return mechanicDataCache;
    }

    try {
        // *** SỬA LỖI: Gọi hàm getGoogleSheetsAPI() (phiên bản singleton) ***
        const sheets = await getGoogleSheetsAPI(); 
        const spreadsheetId = process.env.GOOGLE_SHEET_ID;

        const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: sheetName });
        const rows = res.data.values;

        if (!rows || rows.length <= 1) {
            throw new Error(`Không tìm thấy dữ liệu hoặc chỉ có tiêu đề trong sheet: ${sheetName}`);
        }

        const headers = rows[0].map(h => h.trim());
        const data = rows.slice(1);

        // Xử lý dữ liệu
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
            rolesDataCache = rolesObj;
            cacheTimestamp = now;
            return rolesDataCache;
        }

        if (sheetName === 'Mechanic') {
            const mechanicObj = {};
            data.forEach(row => {
                const phase = row[0]?.toUpperCase().trim(); 
                const time = parseInt(row[1], 10);
                if (phase && !isNaN(time)) {
                    mechanicObj[phase] = time;
                }
            });
            mechanicDataCache = mechanicObj;
            cacheTimestamp = now;
            return mechanicDataCache;
        }

    } catch (error) {
        console.error(`Lỗi khi đọc sheet ${sheetName}:`, error);
        // Trả về cache cũ nếu có lỗi, nếu không thì ném lỗi
        if (sheetName === 'Roles' && rolesDataCache) return rolesDataCache;
        if (sheetName === 'Mechanic' && mechanicDataCache) return mechanicDataCache;
        throw error;
    }
}

// --- 3. CÁC HÀM QUẢN LÝ VÒNG LẶP GAME (STATE MACHINE) ---

/**
 * Hàm "trái tim" của GM Bot.
 */
export async function gameLoop(roomId) {
    const db = getDatabase(getFirebaseAdmin());
    const roomRef = db.ref(`rooms/${roomId}`);
    let roomSnapshot;
    try {
        roomSnapshot = await roomRef.once('value');
    } catch (e) {
        throw new Error(`Không thể đọc phòng ${roomId}: ${e.message}`);
    }
    
    if (!roomSnapshot.exists()) {
        console.warn(`Phòng ${roomId} không tồn tại (có thể đã bị xóa).`);
        return `Phòng ${roomId} không tồn tại.`;
    }

    const roomData = roomSnapshot.val();
    const state = roomData.gameState;
    
    if (!state || state.phase === 'waiting' || state.phase === 'GAME_END') {
        return `Phòng ${roomId} không cần xử lý (phase: ${state?.phase}).`;
    }

    // Kiểm tra xem phase đã hết giờ chưa
    const serverTime = Date.now(); 
    const startTime = state.startTime || 0;
    const duration = (state.duration || 60) * 1000;
    
    if (serverTime < (startTime + duration)) {
        return `Phòng ${roomId} chưa hết giờ (phase: ${state.phase}).`;
    }

    // --- HẾT GIỜ: XỬ LÝ CHUYỂN PHASE ---
    
    let allRolesData;
    let phaseTimes;
    
    try {
        allRolesData = await fetchSheetData('Roles');
    } catch (e) {
        console.error(`!!! LỖI NGHIÊM TRỌNG KHI TẢI 'Roles' SHEET (Phòng ${roomId}):`, e.message);
        throw new Error(`Không thể tải dữ liệu 'Roles': ${e.message}`);
    }

    try {
        phaseTimes = await fetchSheetData('Mechanic');
    } catch (e) {
        console.error(`!!! LỖI KHI TẢI 'Mechanic' SHEET (Phòng ${roomId}):`, e.message);
        console.error("!!! Server sẽ dùng thời gian mặc định (fallback) để tiếp tục.");
        phaseTimes = {}; 
    }

    // Đảm bảo key khớp với Google Sheet (viết hoa)
    const safePhaseTimes = {
        'NGÀY': phaseTimes['NGÀY'] || 180,
        'ĐÊM': phaseTimes['ĐÊM'] || 90, 
        'BIỂU QUYẾT': phaseTimes['BIỂU QUYẾT'] || 60,
        'DAY_1_INTRO': phaseTimes['DAY_1_INTRO'] || 15 
    };

    switch (state.phase) {
        
        case 'DAY_1_INTRO':
            // Hết 15s giới thiệu, vào Đêm 1
            await setGamePhase(roomId, 'NIGHT', safePhaseTimes['ĐÊM'], 1);
            break;

        case 'NIGHT':
            const nightActions = roomData.nightActions?.[state.nightNumber] || {};
            const players = roomData.players;

            const nightResults = calculateNightStatus(players, nightActions, allRolesData, state.nightNumber);
            await applyNightResults(roomId, nightResults, state.nightNumber);
            
            // *** SỬA LỖI: Thêm kiểm tra thắng/thua sau đêm ***
            const winConditionAfterNight = await checkWinCondition(roomId);
            if (winConditionAfterNight.isEnd) {
                await announceWinner(roomId, winConditionAfterNight.winner);
                await setGamePhase(roomId, 'GAME_END', 99999, state.nightNumber);
            } else {
                // Nếu game chưa kết thúc, chuyển sang Thảo luận
                await setGamePhase(roomId, 'DAY_DISCUSS', safePhaseTimes['NGÀY'], state.nightNumber);
            }
            // *** KẾT THÚC SỬA LỖI ***
            break;

        case 'DAY_DISCUSS':
            // Hết giờ thảo luận, chuyển sang Biểu Quyết
            await setGamePhase(roomId, 'VOTE', safePhaseTimes['BIỂU QUYẾT'], state.nightNumber);
            break;

        case 'VOTE':
            // Hết giờ Vote, xử lý logic vote
            const votes = roomData.votes?.[state.nightNumber] || {};
            const voteResults = calculateVoteResults(roomData.players, votes);
            
            await applyVoteResults(roomId, voteResults, roomData.players, votes, state.nightNumber);
            
            // Logic của VOTE_RESULT được chuyển lên đây
            const winCondition = await checkWinCondition(roomId);
            if (winCondition.isEnd) {
                await announceWinner(roomId, winCondition.winner);
                await setGamePhase(roomId, 'GAME_END', 99999, state.nightNumber);
            } else {
                // Bắt đầu đêm tiếp theo
                const nextNight = (state.nightNumber || 1) + 1;
                await setGamePhase(roomId, 'NIGHT', safePhaseTimes['ĐÊM'], nextNight);
            }
            break;
    }
    return `Phòng ${roomId} đã xử lý phase ${state.phase}.`;
}

/**
 * Cập nhật trạng thái (phase) của game trên Firebase.
 */
export async function setGamePhase(roomId, newPhase, durationInSeconds, nightNumber = null) {
    const db = getDatabase(getFirebaseAdmin());
    const phaseData = {
        phase: newPhase,
        startTime: ServerValue.TIMESTAMP,
        duration: durationInSeconds
    };
    
    if (nightNumber) {
        phaseData.nightNumber = nightNumber;
    }

    await db.ref(`rooms/${roomId}/gameState`).update(phaseData);
}

// --- 4. HÀM XỬ LÝ LOGIC GAME CỐT LÕI (THEO `Kind` MỚI) ---

/**
 * Tính toán kết quả cuối đêm dựa trên logic Kind mới.
 */
function calculateNightStatus(players, nightActions, allRolesData, currentNightNumber) {
    
    const livingPlayerIds = Object.keys(players).filter(pId => players[pId].isAlive);
    const wolfFaction = "Bầy Sói";
    const privateLogs = {}; // Log riêng cho từng người

    // 1. Khởi tạo trạng thái đêm
    const liveStatus = {};
    livingPlayerIds.forEach(pId => {
        const player = players[pId];
        if (!player.roleName) {
             console.error(`Player ${player.username} không có roleName!`);
             return; 
        }
        const role = allRolesData[player.roleName] || allRolesData['Dân thường'] || { Faction: 'Phe Dân', Passive: '0', Kind: 'empty' };
        
        const actionLog = [];
        const action = nightActions[pId] || null;
        
        if (action && action.action !== 'wolf_bite') {
            const targetId = action.targetId;
            const targetUsername = targetId ? (players[targetId]?.username || '??') : 'Không ai';
            
            if (action.choice === 'save') actionLog.push(`Bạn đã thử CỨU ${targetUsername}.`);
            else if (action.choice === 'kill') actionLog.push(`Bạn đã thử GIẾT ${targetUsername}.`);
            else if (action.action === 'assassin') actionLog.push(`Bạn đã ÁM SÁT ${targetUsername} (đoán là ${action.guessedRole || '??'}).`);
            else if (action.action === 'curse') actionLog.push(action.choice === 'curse' ? 'Bạn đã chọn NGUYỀN RỦA mục tiêu Sói cắn.' : 'Bạn đã chọn KHÔNG NGUYỀN RỦA.');
            else if (targetId) actionLog.push(`Bạn đã dùng chức năng lên ${targetUsername}.`);
        }
        
        if (role.Faction === wolfFaction) {
             const wolfAction = nightActions[pId];
             if (wolfAction && wolfAction.action === 'wolf_bite' && wolfAction.targetId) {
                 actionLog.push(`Bạn đã vote cắn ${players[wolfAction.targetId].username}.`);
             } else {
                 actionLog.push('Bạn đã không vote cắn.');
             }
        }

        liveStatus[pId] = {
            id: pId,
            isAlive: true,
            damage: 0,
            isProtected: false, 
            isSaved: false,    
            isDisabled: false, 
            isCursed: false,   
            faction: player.faction || role.Faction, 
            role: role,
            passive: {},
            action: action, 
            state: player.state || {},
            actionLog: actionLog.join(' '), 
        };
        
        privateLogs[pId] = [];
        if (liveStatus[pId].actionLog) {
            privateLogs[pId].push(liveStatus[pId].actionLog);
        }
        
        // --- *** BẮT ĐẦU SỬA ĐỔI (Đọc PassiveKind) *** ---
        // (Giả sử tên cột trong Google Sheet của bạn là 'PassiveKind')
        if (role.Passive === "1" && role.PassiveKind && role.PassiveKind !== 'none') {
            if (role.PassiveKind === 'armor') {
                liveStatus[pId].passive.armor = player.state?.armorLeft ?? 2;
            }
            if (role.PassiveKind === 'counteraudit') {
                liveStatus[pId].passive.counteraudit = true;
            }
        }
        // --- *** KẾT THÚC SỬA ĐỔI *** ---
    });

    // 2. Xử lý Sói Cắn (Xác định mục tiêu)
    const wolfVotes = {};
    let wolfBiteTargetId = null;
    
    livingPlayerIds
        .filter(pId => liveStatus[pId] && liveStatus[pId].faction === wolfFaction) 
        .forEach(wolfId => {
            const action = nightActions[wolfId]; 
            if (action && action.targetId) {
                wolfVotes[action.targetId] = (wolfVotes[action.targetId] || 0) + 1;
            }
        });

    let maxVotes = 0;
    let tiedTargets = [];
    for (const targetId in wolfVotes) {
        if (wolfVotes[targetId] > maxVotes) {
            maxVotes = wolfVotes[targetId];
            tiedTargets = [targetId];
        } else if (wolfVotes[targetId] === maxVotes) {
            tiedTargets.push(targetId);
        }
    }
    
    if (tiedTargets.length > 0) {
        wolfBiteTargetId = tiedTargets[Math.floor(Math.random() * tiedTargets.length)];
    }

    // 3. Xử lý các hành động (Phân theo thứ tự ưu tiên)
    
    // --- Ưu tiên 1: Bảo vệ, Khóa, & Phản Soi (Freeze, Shield, Counteraudit) ---
    livingPlayerIds.forEach(pId => {
        if (!liveStatus[pId]) return; 
        const status = liveStatus[pId];
        const player = players[pId]; 
        if (!isActionActive(status, (player.state || {}), currentNightNumber)) return;
        
        const action = status.action;
        const targetId = action.targetId;
        if (!targetId || !liveStatus[targetId]) return;

        if (status.role.Kind === 'freeze') {
            liveStatus[targetId].isDisabled = true;
            liveStatus[targetId].isProtected = true; 
            if (privateLogs[pId]) privateLogs[pId].push(`Bạn đã Đóng Băng ${players[targetId].username}.`);
        }
        
        if (status.role.Kind === 'shield') {
            liveStatus[targetId].isProtected = true;
            if (privateLogs[pId]) privateLogs[pId].push(`Bạn đã Bảo Vệ ${players[targetId].username}.`);
        }
    });

    // --- Ưu tiên 2: Soi (Audit) ---
    livingPlayerIds.forEach(pId => {
        if (!liveStatus[pId]) return;
        const status = liveStatus[pId];
        const player = players[pId];
        if (!isActionActive(status, (player.state || {}), currentNightNumber, true, true)) return; 
        
        const action = status.action;
        const targetId = action.targetId;
        if (!targetId || !liveStatus[targetId]) return;

        if (status.role.Kind === 'audit') {
            const targetStatus = liveStatus[targetId];
            let resultFaction = targetStatus.faction;
            // *** ĐỌC TỪ liveStatus.passive (ĐÃ SỬA Ở BƯỚC 1) ***
            if (targetStatus.passive.counteraudit) {
                if (resultFaction === wolfFaction) resultFaction = "Phe Dân";
                else if (resultFaction === "Phe Dân") resultFaction = wolfFaction;
            }
            if (status.isDisabled) { 
                resultFaction = "Phe Dân";
            }
            if (privateLogs[pId]) privateLogs[pId].push(`Kết quả soi ${players[targetId].username} là: ${resultFaction}.`);
        }
    });

    // --- Ưu tiên 3: Gây sát thương & Nguyền (Kill, Killwolf, Assassin, Curse) ---
    livingPlayerIds.forEach(pId => {
        if (!liveStatus[pId]) return;
        const status = liveStatus[pId];
        const player = players[pId];
        if (!isActionActive(status, (player.state || {}), currentNightNumber) || status.isDisabled) return;

        const action = status.action;
        const targetId = action.targetId;
        
        if (status.role.Kind !== 'curse' && (!targetId || !liveStatus[targetId])) return;

        if (status.role.Kind === 'kill') {
            liveStatus[targetId].damage++;
            if (privateLogs[pId]) privateLogs[pId].push(`Bạn đã tấn công ${players[targetId].username}.`);
        }

        if (status.role.Kind === 'killwolf') {
            if (liveStatus[targetId].faction === wolfFaction) {
                liveStatus[targetId].damage++;
                if (privateLogs[pId]) privateLogs[pId].push(`Bạn đã tấn công đúng Sói (${players[targetId].username}).`);
            } else {
                liveStatus[pId].damage++; // Tự sát
                if (privateLogs[pId]) privateLogs[pId].push(`Bạn đã tấn công nhầm (${players[targetId].username}), bạn tự nhận sát thương.`);
            }
        }

        if (status.role.Kind === 'assassin' && action.guessedRole) {
            if (liveStatus[targetId].role.RoleName === action.guessedRole) {
                liveStatus[targetId].damage++;
                if (privateLogs[pId]) privateLogs[pId].push(`Bạn đã đoán đúng vai trò của ${players[targetId].username}!`);
            } else {
                liveStatus[pId].damage++; // Tự sát
                if (privateLogs[pId]) privateLogs[pId].push(`Bạn đã đoán sai vai trò của ${players[targetId].username}, bạn tự nhận sát thương.`);
            }
        }

        if (status.role.Kind === 'curse' && action.choice === 'curse') {
            if (wolfBiteTargetId && liveStatus[wolfBiteTargetId] && action.targetId === 'wolf_target') {
                 liveStatus[wolfBiteTargetId].isCursed = true;
                 if (privateLogs[pId]) privateLogs[pId].push(`Bạn đã chọn Nguyền rủa mục tiêu Sói cắn (${players[wolfBiteTargetId].username}).`);
            } else if (action.targetId === 'wolf_target') {
                 if (privateLogs[pId]) privateLogs[pId].push(`Bạn đã chọn Nguyền rủa, nhưng Sói không cắn ai.`);
            }
        }
    });

    // --- Ưu tiên 4: Áp dụng Sát Thương Sói Cắn ---
    if (wolfBiteTargetId && liveStatus[wolfBiteTargetId]) {
        if (liveStatus[wolfBiteTargetId].isCursed) {
            // Không nhận sát thương
        } else {
            liveStatus[wolfBiteTargetId].damage++;
        }
    }

    // --- Ưu tiên 5: Cứu (Witch Save) ---
    livingPlayerIds.forEach(pId => {
        if (!liveStatus[pId]) return;
        const status = liveStatus[pId];
        const player = players[pId];
        if (status.isDisabled) return; 
        if (status.role.Kind !== 'witch' || !status.action || status.action.choice !== 'save') return;
        
        if (status.state.witch_save_used) return;
        if (!isActionActive(status, (player.state || {}), currentNightNumber, true, false)) return; 

        const targetId = status.action.targetId;
        if (!targetId || !liveStatus[targetId]) return;

        const targetStatus = liveStatus[targetId];
        // *** ĐỌC TỪ liveStatus.passive (ĐÃ SỬA Ở BƯỚC 1) ***
        const armor = targetStatus.passive.armor || 1;

        if (targetStatus.damage >= armor && !targetStatus.isProtected) {
            targetStatus.isSaved = true;
            status.state.witch_save_used = true; 
            if (privateLogs[pId]) privateLogs[pId].push(`Bạn đã cứu sống ${players[targetId].username} thành công. Bạn mất bình Cứu.`);
        } else {
            if (privateLogs[pId]) privateLogs[pId].push(`Bạn đã dùng thuốc Cứu cho ${players[targetId].username} nhưng họ không chết. Bạn vẫn còn bình Cứu.`);
        }
    });

    // --- Ưu tiên 6: Giết (Witch Kill) ---
    livingPlayerIds.forEach(pId => {
        if (!liveStatus[pId]) return;
        const status = liveStatus[pId];
        const player = players[pId];
        if (status.isDisabled) return;
        if (status.role.Kind !== 'witch' || !status.action || status.action.choice !== 'kill') return;

        if (status.state.witch_kill_used) return;
        if (!isActionActive(status, (player.state || {}), currentNightNumber, true, false)) return;

        const targetId = status.action.targetId;
        if (liveStatus[targetId]) {
            liveStatus[targetId].damage++;
            status.state.witch_kill_used = true; 
            if (privateLogs[pId]) privateLogs[pId].push(`Bạn đã dùng thuốc Giết lên ${players[targetId].username}. Bạn mất bình Giết.`);
        }
    });

    // --- 6. Tổng kết kết quả ---
    const nightResults = {
        deaths: [], 
        stateUpdates: {}, 
        factionChanges: []
    };
    const publicAnnouncement = []; // Thông báo công khai

    livingPlayerIds.forEach(pId => {
        if (!liveStatus[pId]) return;
        const status = liveStatus[pId];
        const player = players[pId];
        
        const newState = { ...status.state }; 
        
        // (DÒNG 671 ĐÃ BỊ XÓA TRONG SUY NGHĨ TRƯỚC - NHƯNG GIỮ LẠI CŨNG KHÔNG SAO
        // VÌ LỖI CRASH ĐÃ ĐƯỢC FIX)
        // *** ĐỌC TỪ liveStatus.passive (ĐÃ SỬA Ở BƯỚC 1) ***
        if (status.passive.armor) {
            newState.armorLeft = status.passive.armor;
        }
        
        if (status.state.witch_save_used) newState.witch_save_used = true;
        if (status.state.witch_kill_used) newState.witch_kill_used = true;

        if (status.action && isActionActive(status, (player.state || {}), currentNightNumber, false)) { 
            const activeRule = status.role.Active;
            if (activeRule !== 'n' && activeRule !== '0') {
                const activeLeft = (parseInt(newState.activeLeft ?? activeRule)) - 1;
                newState.activeLeft = activeLeft;
            }
        }
        
        if (status.action && status.action.targetId) {
            newState.lastTargetId = status.action.targetId;
        }
        
        // (Sửa lỗi crash đã được áp dụng bên dưới)

        if (status.damage > 0 && !status.isProtected && !status.isSaved) {
            // *** ĐỌC TỪ liveStatus.passive (ĐÃ SỬA Ở BƯỚC 1) ***
            if (status.passive.armor && status.passive.armor > 1) {
                
                // ===============================================
                // === SỬA LỖI TẠI ĐÂY (Dòng 684 gốc) ===
                newState.armorLeft = status.passive.armor - 1;
                // ===============================================

                if (privateLogs[pId]) privateLogs[pId].push("Bạn đã bị tấn công nhưng Giáp đã đỡ.");
            } else {
                status.isAlive = false; 
                nightResults.deaths.push({
                    id: pId,
                    username: player.username,
                    roleName: player.roleName,
                    cause: (pId === wolfBiteTargetId && !status.isCursed) ? 'Bầy Sói' : 'Chức năng'
                });
                if (privateLogs[pId]) privateLogs[pId].push('Bạn đã CHẾT!');
            }
        }
        
        nightResults.stateUpdates[pId] = newState; // Ghi lại newState (đã cập nhật)

        if (status.isCursed) {
            nightResults.factionChanges.push({
                playerId: pId,
                newFaction: wolfFaction,
                newRoleName: "Sói thường", 
                oldRoleName: player.roleName
            });
            if (privateLogs[pId]) privateLogs[pId].push("Bạn đã bị Nguyền rủa! Từ giờ bạn thuộc Bầy Sói.");
        }
    });

    if (nightResults.deaths.length === 0) {
        publicAnnouncement.push("Đêm nay không có ai chết.");
    } else {
        const deadNames = nightResults.deaths.map(d => d.username).join(', ');
        publicAnnouncement.push(`Đêm nay, ${deadNames} đã bị giết.`);
    }

    if (nightResults.factionChanges.length > 0) {
        const cursedName = players[nightResults.factionChanges[0].playerId].username;
        publicAnnouncement.push(`${cursedName} đã bị Bầy Sói nguyền rủa và biến thành Sói!`);
    }
    
    const finalPrivateLogs = {};
    livingPlayerIds.forEach(pId => {
        finalPrivateLogs[pId] = privateLogs[pId].join('\n');
    });

    return { ...nightResults, publicAnnouncement: publicAnnouncement.join(' '), privateLogs: finalPrivateLogs };
}


/**
 * Helper function: Kiểm tra xem hành động có được kích hoạt không
 */
function isActionActive(status, playerState, currentNightNumber, checkReSelect = true, allowWhenDisabled = false) {
    const role = status.role;
    // *** SỬA LỖI 500: Đảm bảo state không bao giờ là null ***
    const state = playerState || {};
    const action = status.action;

    if (!action) return false;
    if (!allowWhenDisabled && status.isDisabled) return false; 

    if (role.Night !== 'n' && parseInt(role.Night) > currentNightNumber) {
        return false; 
    }

    if (role.Active === '0') return false; 
    if (role.Active !== 'n') {
        // *** SỬA LỖI 500: Đọc từ state (đã an toàn) ***
        const activeLeft = (parseInt(state.activeLeft ?? role.Active)); 
        if (activeLeft <= 0) return false; 
    }
  
    if (checkReSelect) {
        const reselectDisabled = (role.ReSelect === '0');
        if (reselectDisabled) {
           if (state.lastTargetId === action.targetId) {
               return false; 
           }
        }
    }
    
    if (role.Kind === 'witch') {
         if (action.choice === 'save' && state.witch_save_used) return false;
         if (action.choice === 'kill' && state.witch_kill_used) return false;
    }

    return true;
}

/**
 * Ghi kết quả đêm lên Firebase.
 */
async function applyNightResults(roomId, results, nightNumber) {
    const db = getDatabase(getFirebaseAdmin());
    const updates = {};
    const roomRef = db.ref(`rooms/${roomId}`);

    results.deaths.forEach(deadPlayer => {
        updates[`/players/${deadPlayer.id}/isAlive`] = false;
        updates[`/players/${deadPlayer.id}/causeOfDeath`] = deadPlayer.cause;
    });

    for (const pId in results.stateUpdates) {
        updates[`/players/${pId}/state`] = results.stateUpdates[pId];
    }

    results.factionChanges.forEach(change => {
        updates[`/players/${change.playerId}/roleName`] = change.newRoleName;
        updates[`/players/${change.playerId}/originalRoleName`] = change.oldRoleName; 
        updates[`/players/${change.playerId}/faction`] = change.newFaction;
        updates[`/players/${change.playerId}/state`] = {}; 
    });

    const timestamp = ServerValue.TIMESTAMP;
    const publicMsg = results.publicAnnouncement; 

    const allPlayerIds = Object.keys(await (await roomRef.child('players').once('value')).val());
    
    allPlayerIds.forEach(pId => {
        const privateMsg = results.privateLogs[pId] || ''; 
        const finalLog = [privateMsg, publicMsg].filter(Boolean).join('\n'); 

        if (finalLog) {
            updates[`/privateData/${pId}/night_${nightNumber}`] = {
                 message: finalLog,
                 timestamp: timestamp
            };
        }
    });

    await roomRef.update(updates);
}

/**
 * Tính kết quả vote.
 */
function calculateVoteResults(players, votes) {
    const livingPlayerIds = Object.keys(players).filter(pId => players[pId].isAlive);
    const voteCounts = { 'skip_vote': 0 };
    livingPlayerIds.forEach(pId => voteCounts[pId] = 0); 

    livingPlayerIds.forEach(voterId => {
        const targetId = votes[voterId]; 
        if (targetId && voteCounts.hasOwnProperty(targetId)) {
            voteCounts[targetId]++;
        } else {
            voteCounts['skip_vote']++; 
        }
    });

    let maxVotes = 0;
    let mostVotedPlayerId = null;
    let isTied = false;

    for (const targetId in voteCounts) {
        if (targetId === 'skip_vote') continue;

        const count = voteCounts[targetId];
        if (count > maxVotes) {
            maxVotes = count;
            mostVotedPlayerId = targetId;
            isTied = false;
        } else if (count === maxVotes && maxVotes > 0) {
            isTied = true;
        }
    }

    if (maxVotes === 0 || voteCounts['skip_vote'] >= maxVotes || isTied) {
        return { executedPlayerId: null, announcement: "Biểu quyết thất bại. Không có ai bị treo cổ." };
    }

    return { 
        executedPlayerId: mostVotedPlayerId,
        announcement: `${players[mostVotedPlayerId].username} đã bị treo cổ với ${maxVotes} phiếu.`
    };
}

/**
 * Ghi kết quả vote lên Firebase.
 */
async function applyVoteResults(roomId, results, players, votes, nightNumber) {
    const db = getDatabase(getFirebaseAdmin());
    const updates = {};
    const timestamp = ServerValue.TIMESTAMP;

    if (results.executedPlayerId) {
        updates[`/players/${results.executedPlayerId}/isAlive`] = false;
        updates[`/players/${results.executedPlayerId}/causeOfDeath`] = "Treo cổ";
    }

    Object.keys(players).forEach(pId => {
        const myVoteTargetId = votes[pId];
        let voteLog = '';

        if (players[pId].isAlive) { 
            if (myVoteTargetId === 'skip_vote') voteLog = 'Bạn đã vote BỎ QUA.';
            else if (myVoteTargetId && players[myVoteTargetId]) voteLog = `Bạn đã vote treo cổ ${players[myVoteTargetId].username}.`;
            else voteLog = 'Bạn đã KHÔNG VOTE.';
        } else {
            voteLog = 'Bạn đã chết và không thể vote.';
        }

        const finalLog = voteLog + '\n' + results.announcement;
        
        updates[`/privateData/${pId}/day_${nightNumber}`] = {
            message: finalLog,
            timestamp: timestamp
        };
    });

    await db.ref(`rooms/${roomId}`).update(updates);
}

/**
 * Kiểm tra điều kiện thắng.
 */
async function checkWinCondition(roomId) {
    const db = getDatabase(getFirebaseAdmin());
    const playersSnapshot = await db.ref(`rooms/${roomId}/players`).once('value');
    const players = playersSnapshot.val();

    let wolfCount = 0;
    let villagerCount = 0;
    let thirdPartyCount = 0;

    // *** SỬA LỖI: Đảm bảo players tồn tại trước khi dùng Object.values ***
    if (!players) {
        console.error(`Lỗi checkWinCondition: Không tìm thấy players trong phòng ${roomId}`);
        return { isEnd: false, winner: null }; // Không thể xác định, game tiếp tục
    }

    Object.values(players).forEach(p => {
        if (p.isAlive) {
            if (p.faction === "Bầy Sói") {
                wolfCount++;
            } else if (p.faction === "Phe Dân") {
                villagerCount++;
            } else if (p.faction === "Phe thứ ba") {
                thirdPartyCount++;
            }
        }
    });

    if (wolfCount === 0) {
        return { isEnd: true, winner: "Phe Dân" };
    }
    if (wolfCount >= (villagerCount + thirdPartyCount)) {
        return { isEnd: true, winner: "Bầy Sói" };
    }
    
    return { isEnd: false, winner: null };
}

/**
 * Thông báo người thắng cuộc.
 */
async function announceWinner(roomId, winnerFaction) {
     const db = getDatabase(getFirebaseAdmin());
     const message = `Trò chơi kết thúc! ${winnerFaction} đã chiến thắng!`;
     
     const playersSnapshot = await db.ref(`rooms/${roomId}/players`).once('value');
     const players = playersSnapshot.val();

     // *** SỬA LỖI: Đảm bảo players tồn tại ***
     if (!players) {
         console.error(`Lỗi announceWinner: Không tìm thấy players trong phòng ${roomId}`);
         return;
     }

     const updates = {};
     const timestamp = ServerValue.TIMESTAMP;
     
     Object.keys(players).forEach(pId => {
         updates[`/privateData/${pId}/game_end`] = {
             message: message,
             timestamp: timestamp
         };
     });
     
     await db.ref(`rooms/${roomId}`).update(updates);
}