document.addEventListener('DOMContentLoaded', () => {
    // --- 1. CẤU HÌNH FIREBASE (Theo config bạn cung cấp) ---
    const firebaseConfig = {
        apiKey: "AIzaSyBEms1bIjCN8tUootTYQGAralVMh8cO5_w",
        authDomain: "ma-soi-web-app.firebaseapp.com",
        databaseURL: "https://ma-soi-web-app-default-rtdb.asia-southeast1.firebasedatabase.app",
        projectId: "ma-soi-web-app",
        storageBucket: "ma-soi-web-app.firebasestorage.app",
        messagingSenderId: "285959781073",
        appId: "1:285959781073:web:410c7f4a22149f373523f0"
    };
    firebase.initializeApp(firebaseConfig);
    const database = firebase.database();

    // --- 2. BIẾN TRẠNG THÁI TOÀN CỤC ---
    let currentRoomId = null;
    let myPlayerId = null;
    let myUsername = null;
    let isHost = false;
    let allRolesData = {}; // Cache cho sheet Roles
    let mainRoomListener = null; // Listener chính cho phòng
    let chatListeners = {}; // Listeners cho các kênh chat
    let activeChatChannel = 'living'; // Kênh chat mặc định
    
    // *** SỬA LỖI LOGIC: Thêm biến lưu trữ roomData toàn cục ***
    // Để các hàm render (như renderNightActions) có thể truy cập
    let currentRoomData = null;


    // --- 3. ÁNH XẠ KIND MỚI (Cho UI) ---
    // Dùng để render giao diện hành động đêm
    const KIND_UI_MAP = {
        'empty': { type: 'passive', title: 'Nghỉ ngơi' },
        'shield': { type: 'target', title: 'Bảo vệ', description: 'Chọn một người để bảo vệ đêm nay.' },
        'kill': { type: 'target', title: 'Giết', description: 'Chọn một người để ám sát đêm nay.' },
        'audit': { type: 'target', title: 'Soi phe', description: 'Chọn một người để xem phe của họ.' },
        'witch': { type: 'witch', title: 'Thuốc Phù thủy', description: 'Chọn dùng bình Cứu hoặc bình Giết.' },
        'killwolf': { type: 'target', title: 'Săn Sói', description: 'Chọn một người bạn nghĩ là Sói để bắn.' },
        'armor': { type: 'passive', title: 'Nội tại: Giáp' },
        'assassin': { type: 'assassin', title: 'Ám Sát', description: 'Chọn một người để đoán vai trò.' },
        'curse': { type: 'curse', title: 'Nguyền rủa', description: 'Bạn có muốn nguyền rủa mục tiêu Sói cắn không?' },
        'freeze': { type: 'target', title: 'Đóng băng', description: 'Chọn một người để đóng băng chức năng và bảo vệ họ.' },
        'counteraudit': { type: 'passive', title: 'Nội tại: Phản soi' }
    };

    // --- 4. DOM ELEMENTS (Lấy 1 lần) ---
    const getEl = (id) => document.getElementById(id);

    // Lobby
    const lobbySection = getEl('lobby-section');
    const lobbyPlayerName = getEl('lobby-player-name');
    const createRoomBtn = getEl('create-room-btn');
    const createRoomOptions = getEl('create-room-options');
    const roomPrivateCheckbox = getEl('room-private-checkbox');
    const roomPasswordInput = getEl('room-password-input');
    const confirmCreateRoomBtn = getEl('confirm-create-room-btn');
    const createRoomError = getEl('create-room-error');
    const roomList = getEl('room-list');
    const joinPasswordSection = getEl('join-password-section');
    const joinPasswordInput = getEl('join-password-input');
    const confirmJoinRoomBtn = getEl('confirm-join-room-btn');
    const joinRoomError = getEl('join-room-error');

    // Game Room
    const gameRoomSection = getEl('game-room-section');
    const playerNameDisplay = getEl('player-name-display');
    const roomIdDisplay = getEl('room-id-display');
    const hostNameDisplay = getEl('host-name-display');

    // Host
    const hostControls = getEl('host-controls');
    const hostLobbyControls = getEl('host-lobby-controls');
    const hostStartGameBtn = getEl('host-start-game-btn');
    const roleSelectionGrid = getEl('role-selection-grid');
    const playerCountInRoom = getEl('player-count-in-room');
    const roleCountSelected = getEl('role-count-selected');
    const hostGameplayControls = getEl('host-gameplay-controls');
    const hostSkipPhaseBtn = getEl('host-skip-phase-btn');
    const hostResetGameBtn = getEl('host-reset-game-btn');
    const hostRestartGameBtn = getEl('host-restart-game-btn');
    const hostEndGameBtn = getEl('host-end-game-btn');
    const hostDeleteRoomBtn = getEl('host-delete-room-btn');
    
    // Player List
    const playerListSection = getEl('player-list-section');
    const playerCountDisplay = getEl('player-count-display');
    const playerListIngame = getEl('player-list-ingame');

    // Game State Cards
    const waitingSection = getEl('waiting-section');
    const waitingTitle = getEl('waiting-title');
    const waitingMessage = getEl('waiting-message');
    const roleRevealSection = getEl('role-reveal-section');
    const votingUiSection = getEl('voting-ui-section');
    const voteTitleDisplay = getEl('vote-title-display');
    const voteTimerDisplay = getEl('vote-timer-display');
    const voteOptionsContainer = getEl('vote-options-container');
    const voteStatusMessage = getEl('vote-status-message');
    const phaseDisplaySection = getEl('phase-display-section');
    const phaseTitle = getEl('phase-title');
    const phaseTimerDisplay = getEl('phase-timer-display');
    const phaseMessage = getEl('phase-message');
    const phaseResults = getEl('phase-results');

    // Action & Logs
    const privateLogSection = getEl('private-log-section');
    const privateLogContent = getEl('private-log-content');
    const interactiveActionSection = getEl('interactive-action-section');
    const playerControls = getEl('player-controls');
    const openWillModalBtn = getEl('open-will-modal-btn');
    const rolesInGameDisplay = getEl('roles-in-game-display');

    // Chat
    const chatSection = getEl('chat-section');
    const chatChannels = getEl('chat-channels');
    const chatMessages = getEl('chat-messages');
    const messageInput = getEl('message-input');
    const sendMessageBtn = getEl('send-message-btn');

    // Modals
    const roleDescriptionModal = getEl('role-description-modal');
    const willWritingModal = getEl('will-writing-modal');
    const publishedWillModal = getEl('published-will-modal');
    const announcementModal = getEl('announcement-modal');
    
    let selectedRoomToJoin = null; // Biến tạm để lưu ID phòng khi nhập pass

    // --- 5. HÀM KHỞI TẠO & QUẢN LÝ ---

    /**
     * Chạy khi tải trang
     */
    async function initialize() {
        myUsername = sessionStorage.getItem('mywolf_username');
        if (!myUsername) {
            window.location.href = 'index.html'; // Quay về trang login nếu chưa đăng nhập
            return;
        }

        // Lấy dữ liệu vai trò 1 lần
        try {
            const response = await fetch('/api/sheets?sheetName=Roles');
            
            // SỬA 1: Thêm kiểm tra response.ok
            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`API /api/sheets trả về lỗi ${response.status}. Chi tiết: ${errText}`);
            }
            
            const rolesArray = await response.json();
            
            // SỬA 2: Kiểm tra kỹ hơn
            if (!rolesArray || !Array.isArray(rolesArray)) {
                 throw new Error("API /api/sheets không trả về dữ liệu mảng (array).");
            }

            // (Lọc hàng trống đã được chuyển sang api/sheets.js,
            // nhưng chúng ta vẫn lọc ở đây để đảm bảo an toàn)
            allRolesData = rolesArray.reduce((acc, role) => {
                if (role && role.RoleName && role.RoleName.trim() !== "") {
                    acc[role.RoleName.trim()] = role; 
                }
                return acc;
            }, {});

            if (Object.keys(allRolesData).length === 0) {
                 throw new Error("Không có dữ liệu vai trò nào được tải (allRolesData rỗng). Kiểm tra Google Sheet 'Roles'.");
            }
            
        } catch (e) {
            console.error("Lỗi tải dữ liệu Roles:", e);
            alert(`Lỗi nghiêm trọng: Không thể tải dữ liệu vai trò.\nChi tiết: ${e.message}\nVui lòng kiểm tra console (F12) và liên hệ admin.`);
            return; // Dừng thực thi
        }

        // Kiểm tra xem người chơi có đang ở trong phòng nào không
        currentRoomId = sessionStorage.getItem('mywolf_roomid');
        if (currentRoomId) {
            // Nếu có, thử vào thẳng phòng
            showGameRoom();
            attachMainRoomListener(currentRoomId);
            attachChatListeners(currentRoomId);
        } else {
            // Nếu không, hiển thị sảnh chờ
            showLobby();
        }

        // Gắn listener chung
        attachCommonListeners();
    }

    /**
     * Hiển thị sảnh chờ và tải danh sách phòng
     */
    function showLobby() {
        lobbySection.classList.remove('hidden');
        gameRoomSection.classList.add('hidden');
        lobbyPlayerName.textContent = myUsername;
        fetchRoomList();
    }

    /**
     * Hiển thị phòng game
     */
    function showGameRoom() {
        lobbySection.classList.add('hidden');
        gameRoomSection.classList.remove('hidden');
        playerNameDisplay.textContent = myUsername;
    }

    /**
     * Gắn các listener không đổi (modals, lobby buttons)
     */
    function attachCommonListeners() {
        // Lobby
        createRoomBtn.addEventListener('click', () => {
            createRoomOptions.classList.toggle('hidden');
        });
        
        confirmCreateRoomBtn.addEventListener('click', handleCreateRoom);

        // Modals
        [roleDescriptionModal, willWritingModal, publishedWillModal, announcementModal].forEach(modal => {
            if (modal) {
                modal.addEventListener('click', (e) => {
                    if (e.target === modal || e.target.classList.contains('close-modal-btn')) {
                        modal.classList.add('hidden');
                    }
                });
            }
        });

        // Di Chúc
        openWillModalBtn.addEventListener('click', openWillModal);
        getEl('save-will-btn').addEventListener('click', saveWill);
        getEl('will-textarea').addEventListener('input', updateWordCount);

        // Chat
        sendMessageBtn.addEventListener('click', handleSendMessage);
        messageInput.addEventListener('keyup', (e) => {
            if (e.key === 'Enter') handleSendMessage();
        });
        chatChannels.addEventListener('click', (e) => {
            if (e.target.classList.contains('channel-btn')) {
                switchChatChannel(e.target.dataset.channel);
            }
        });

        // Host Controls
        hostStartGameBtn.addEventListener('click', () => handleHostAction('start-game'));
        hostSkipPhaseBtn.addEventListener('click', () => handleHostAction('skip-phase'));
        hostEndGameBtn.addEventListener('click', () => handleHostAction('end-game'));
        hostDeleteRoomBtn.addEventListener('click', () => handleHostAction('delete-room'));
        hostResetGameBtn.addEventListener('click', () => handleHostAction('reset-game'));
        hostRestartGameBtn.addEventListener('click', () => handleHostAction('restart-game'));

        // Xử lý chọn vai trò (Host)
        roleSelectionGrid.addEventListener('change', updateRoleSelectionCount);
        
        // Listener cho thẻ bài
        roleRevealSection.addEventListener('click', () => {
             roleRevealSection.classList.toggle('is-flipped');
        });
    }
    
    // --- 6. LOGIC LOBBY (TẠO/VÀO PHÒNG) ---

    /**
     * Tải và hiển thị danh sách phòng
     */
    async function fetchRoomList() {
        try {
            const response = await fetch('/api/room'); // Gọi API lấy danh sách phòng
            if (!response.ok) throw new Error('Không thể tải danh sách phòng.');
            const rooms = await response.json();

            roomList.innerHTML = ''; // Xóa danh sách cũ
            if (rooms.length === 0) {
                roomList.innerHTML = '<p>Không có phòng nào đang mở.</p>';
                return;
            }

            rooms.forEach(room => {
                // Chỉ hiển thị phòng đang chờ
                if (room.status === 'waiting' || !room.status) {
                    const item = document.createElement('div');
                    item.className = 'room-item';
                    item.dataset.roomId = room.id;
                    item.dataset.private = room.isPrivate;
                    item.innerHTML = `
                        <div>
                            <span class="room-name">Phòng ${room.id}</span>
                            <span class="room-status">${room.isPrivate ? '🔒' : '🌍'}</span>
                        </div>
                        <span class="room-players">${room.playerCount} người</span>
                    `;
                    item.addEventListener('click', () => handleJoinRoomClick(room.id, room.isPrivate));
                    roomList.appendChild(item);
                }
            });

        } catch (e) {
            console.error(e);
            roomList.innerHTML = `<p class="error-message">Lỗi tải danh sách phòng.</p>`;
        }
    }

    /**
     * Xử lý khi Host nhấn "Xác Nhận Tạo"
     */
    async function handleCreateRoom() {
        const isPrivate = roomPrivateCheckbox.checked;
        const password = roomPasswordInput.value;

        if (isPrivate && !password) {
            createRoomError.textContent = "Phòng riêng tư phải có mật khẩu.";
            return;
        }
        createRoomError.textContent = "";
        confirmCreateRoomBtn.disabled = true;

        try {
            const response = await fetch('/api/host-actions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'create-room',
                    username: myUsername, 
                    isPrivate: isPrivate,
                    password: password
                })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Lỗi khi tạo phòng');

            sessionStorage.setItem('mywolf_roomid', data.roomId);
            showGameRoom();
            attachMainRoomListener(data.roomId);
            attachChatListeners(data.roomId);

        } catch (e) {
            createRoomError.textContent = e.message;
            confirmCreateRoomBtn.disabled = false;
        }
    }

    /**
     * Xử lý khi Player nhấn vào một phòng
     */
    function handleJoinRoomClick(roomId, isPrivate) {
        joinPasswordSection.classList.add('hidden');
        joinRoomError.textContent = '';
        selectedRoomToJoin = roomId; 

        if (isPrivate) {
            joinPasswordSection.classList.remove('hidden');
            joinPasswordInput.value = '';
            confirmJoinRoomBtn.onclick = () => handleConfirmJoinRoom(true);
        } else {
            handleConfirmJoinRoom(false);
        }
    }

    /**
     * Xử lý khi Player xác nhận vào phòng
     */
    async function handleConfirmJoinRoom(isPrivate) {
        const password = isPrivate ? joinPasswordInput.value : null;
        if (isPrivate && !password) {
            joinRoomError.textContent = "Vui lòng nhập mật khẩu.";
            return;
        }
        
        joinRoomError.textContent = '';

        try {
            const response = await fetch('/api/host-actions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'join-room',
                    roomId: selectedRoomToJoin,
                    username: myUsername,
                    password: password
                })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Lỗi khi vào phòng');
            
            sessionStorage.setItem('mywolf_roomid', selectedRoomToJoin);
            showGameRoom();
            attachMainRoomListener(selectedRoomToJoin);
            attachChatListeners(selectedRoomToJoin);

        } catch (e) {
            joinRoomError.textContent = e.message;
        }
    }

    // --- 7. LOGIC GAME CHÍNH (LẮNG NGHE FIREBASE) ---

    /**
     * Hủy các listener cũ
     */
    function cleanupListeners() {
        if (mainRoomListener) database.ref(`rooms/${currentRoomId}`).off('value', mainRoomListener);
        Object.values(chatListeners).forEach(listener => listener.ref.off('child_added', listener.handler));
        chatListeners = {};
        currentRoomData = null; // Xóa dữ liệu phòng cũ
    }

    /**
     * Gắn listener chính vào phòng game
     */
    function attachMainRoomListener(roomId) {
        cleanupListeners(); 
        currentRoomId = roomId;
        const roomRef = database.ref(`rooms/${roomId}`);
        
        mainRoomListener = roomRef.on('value', (snapshot) => {
            const roomData = snapshot.val();
            
            // *** SỬA LỖI LOGIC: Lưu roomData để các hàm khác dùng ***
            currentRoomData = roomData; 
            
            if (!roomData) {
                alert("Phòng đã bị xóa bởi Host.");
                sessionStorage.removeItem('mywolf_roomid');
                cleanupListeners();
                showLobby();
                return;
            }

            myPlayerId = Object.keys(roomData.players).find(pId => roomData.players[pId].username === myUsername);
            if (!myPlayerId) {
                alert("Bạn đã bị kick khỏi phòng.");
                sessionStorage.removeItem('mywolf_roomid');
                cleanupListeners();
                showLobby();
                return;
            }
            
            const myPlayerData = roomData.players[myPlayerId];
            isHost = (myPlayerId === roomData.hostId);

            // Cập nhật UI
            roomIdDisplay.textContent = roomId;
            hostNameDisplay.textContent = roomData.players[roomData.hostId]?.username || '...';
            updatePlayerList(roomData.players);
            updateHostControls(roomData);
            
            // *** SỬA LỖI 1: "Trạng thái không xác định" ***
            updateMainUI(roomData.gameState, myPlayerData); 
            
            updateChatChannels(myPlayerData, roomData.gameState?.phase); 
            
            if (roomData.publicData?.latestAnnouncement) {
                showAnnouncement(roomData.publicData.latestAnnouncement);
            }
            if (roomData.privateData?.[myPlayerId]) {
                updatePrivateLog(roomData.privateData[myPlayerId]);
            }

        }, (error) => {
            console.error("Lỗi listener:", error);
            alert("Mất kết nối với phòng game.");
            sessionStorage.removeItem('mywolf_roomid');
            showLobby();
        });
    }

    /**
     * Cập nhật danh sách người chơi
     */
    function updatePlayerList(players) {
        playerListIngame.innerHTML = '';
        let count = 0;
        for (const pId in players) {
            const player = players[pId];
            count++;
            const li = document.createElement('li');
            li.innerHTML = `
                <span>
                    ${player.isAlive ? '❤️' : '💀'}
                    ${player.username}
                    ${pId === currentRoomData.hostId ? ' (Host)' : ''}
                </span>
                ${(isHost && pId !== myPlayerId) ? `<button class="player-kick-btn" data-player-id="${pId}">Kick</button>` : ''}
            `;
            playerListIngame.appendChild(li);
        }
        playerCountDisplay.textContent = count;
        playerCountInRoom.textContent = count; 
        
        playerListIngame.querySelectorAll('.player-kick-btn').forEach(btn => {
            btn.onclick = () => handleHostAction('kick-player', { playerId: btn.dataset.playerId });
        });
    }

    /**
     * Cập nhật hiển thị nút điều khiển Host
     */
    function updateHostControls(roomData) {
        if (!isHost) {
            hostControls.classList.add('hidden');
            return;
        }

        hostControls.classList.remove('hidden');
        const phase = roomData.gameState?.phase;

        if (phase === 'waiting') {
            hostLobbyControls.classList.remove('hidden');
            hostGameplayControls.classList.add('hidden');
            hostDeleteRoomBtn.classList.remove('hidden'); 
            
            // Render danh sách vai trò (chỉ 1 lần)
            if (!roleSelectionGrid.hasChildNodes() && Object.keys(allRolesData).length > 0) {
                renderRoleSelection();
            }
            updateRoleSelectionCount(); 
            
            const playerCount = Object.keys(roomData.players).length;
            const rolesSelected = (roomData.gameSettings?.roles || []).length;
            
            const hasWolf = (roomData.gameSettings?.roles || []).some(roleName => allRolesData[roleName] && allRolesData[roleName].Faction === 'Bầy Sói');
            
            if (playerCount >= 4 && playerCount === rolesSelected && hasWolf) {
                hostStartGameBtn.disabled = false;
            } else {
                hostStartGameBtn.disabled = true;
            }

        } else if (phase === 'GAME_END') {
            hostLobbyControls.classList.add('hidden');
            hostGameplayControls.classList.remove('hidden');
            hostDeleteRoomBtn.classList.remove('hidden');
            hostSkipPhaseBtn.classList.add('hidden'); 
            hostStartGameBtn.classList.add('hidden');
        } else {
            hostLobbyControls.classList.add('hidden');
            hostGameplayControls.classList.remove('hidden');
            hostDeleteRoomBtn.classList.add('hidden'); 
            hostSkipPhaseBtn.classList.remove('hidden');
            hostStartGameBtn.classList.add('hidden');
        }
    }

    /**
     * Render các checkbox chọn vai trò cho Host
     */
    function renderRoleSelection() {
        roleSelectionGrid.innerHTML = '';
        
        const defaultRoleNames = {
            civilian: "Dân thường",
            wolf: "Sói thường"
        };
        
        const civilianRoleName = Object.keys(allRolesData).find(name => allRolesData[name].RoleName === defaultRoleNames.civilian) || defaultRoleNames.civilian;
        const wolfRoleName = Object.keys(allRolesData).find(name => allRolesData[name].RoleName === defaultRoleNames.wolf) || defaultRoleNames.wolf;

        const defaultRoles = [civilianRoleName, wolfRoleName];

        for (const roleName in allRolesData) {
            if (defaultRoles.includes(roleName)) continue; 
            
            const role = allRolesData[roleName];
            
            if (!role.Faction) continue; // Bỏ qua vai trò không hợp lệ
            
            const div = document.createElement('div');
            div.className = 'role-selection-item'; 
            div.innerHTML = `
                <label>
                    <input type="checkbox" class="role-select-cb" value="${roleName}">
                    ${roleName} (${role.Faction})
                </label>
            `;
            roleSelectionGrid.appendChild(div);
        }
    }


    /**
     * Cập nhật số lượng vai trò Host đã chọn và gửi lên Firebase
     */
    function updateRoleSelectionCount() {
        if (!isHost) return;

        const selectedRoles = [];
        roleSelectionGrid.querySelectorAll('.role-select-cb:checked').forEach(cb => {
            selectedRoles.push(cb.value);
        });
        
        const playerCount = parseInt(playerCountInRoom.textContent, 10) || 0;
        
        const wolfRoleName = "Sói thường"; 
        if (allRolesData[wolfRoleName]) {
            selectedRoles.push(wolfRoleName);
        } else {
            console.error("Thiếu vai trò 'Sói thường' trong allRolesData!");
        }
        
        const civilianRoleName = "Dân thường"; 
        const civilianCount = playerCount - selectedRoles.length;
        if (allRolesData[civilianRoleName]) {
            for (let i = 0; i < civilianCount; i++) {
                selectedRoles.push(civilianRoleName);
            }
        } else {
             console.error("Thiếu vai trò 'Dân thường' trong allRolesData!");
        }
        
        roleCountSelected.textContent = selectedRoles.length;
        
        database.ref(`rooms/${currentRoomId}/gameSettings`).set({
            roles: selectedRoles
        });
    }

    /**
     * Hàm chính điều khiển giao diện dựa trên phase
     */
    function updateMainUI(gameState, myPlayerData) {
        // Ẩn tất cả các card trạng thái
        [waitingSection, roleRevealSection, votingUiSection, phaseDisplaySection, interactiveActionSection].forEach(el => el.classList.add('hidden'));
        // Ẩn thẻ bài lật
        roleRevealSection.classList.remove('is-flipped');

        if (!myPlayerData) {
             console.error("Không tìm thấy myPlayerData!");
             return;
        }

        // Cập nhật trạng thái Sống/Chết
        if (!myPlayerData.isAlive) {
            document.body.classList.add('is-dead');
            openWillModalBtn.disabled = true;
            openWillModalBtn.textContent = 'Đã Chết';
        } else {
             document.body.classList.remove('is-dead');
             openWillModalBtn.disabled = false;
             openWillModalBtn.textContent = 'Viết Di Chúc';
        }
        
        if (!gameState) {
             waitingSection.classList.remove('hidden');
             waitingTitle.textContent = "Đang tải...";
             waitingMessage.textContent = "Trạng thái không xác định (gameState null).";
             return; 
        }

        const nightNum = gameState.nightNumber || 0;

        switch (gameState.phase) {
            case 'waiting':
                waitingSection.classList.remove('hidden');
                waitingTitle.textContent = "Đang chờ Host...";
                waitingMessage.textContent = "Host đang cài đặt vai trò. Trò chơi sẽ sớm bắt đầu.";
                break;
            
            case 'DAY_1_INTRO':
                roleRevealSection.classList.remove('hidden');
                if (myPlayerData.roleName) {
                    renderRoleCard(myPlayerData.roleName, myPlayerData.faction);
                } else {
                    // Xử lý trường hợp roleName chưa kịp về
                     renderRoleCard("?", "Đang chờ");
                }
                break;

            case 'NIGHT':
                if (myPlayerData.isAlive) {
                    interactiveActionSection.classList.remove('hidden');
                    renderNightActions(myPlayerData, nightNum);
                } else {
                    waitingSection.classList.remove('hidden');
                    waitingTitle.textContent = `Đêm ${nightNum}`;
                    waitingMessage.textContent = "Bạn đã chết. Hãy quan sát...";
                }
                break;

            case 'DAY_RESULT':
            case 'VOTE_RESULT':
            case 'GAME_END':
                phaseDisplaySection.classList.remove('hidden');
                phaseTitle.textContent = "Kết Quả";
                if (gameState.phase === 'GAME_END') {
                    phaseTitle.textContent = "KẾT THÚC GAME";
                }
                // Thông báo sẽ được hiển thị qua listener 'latestAnnouncement'
                break;

            case 'DAY_DISCUSS':
                phaseDisplaySection.classList.remove('hidden');
                phaseTitle.textContent = `Ngày ${nightNum}`;
                phaseMessage.textContent = "Thảo luận để tìm ra Sói!";
                phaseResults.innerHTML = '';
                break;

            case 'VOTE':
                if (myPlayerData.isAlive) {
                    votingUiSection.classList.remove('hidden');
                    renderVoting(gameState);
                } else {
                    waitingSection.classList.remove('hidden');
                    waitingTitle.textContent = "Đang Biểu Quyết";
                    waitingMessage.textContent = "Bạn đã chết, không thể tham gia biểu quyết.";
                }
                break;

            default:
                waitingSection.classList.remove('hidden');
                waitingTitle.textContent = "Đang tải...";
                waitingMessage.textContent = `Trạng thái không xác định: ${gameState.phase}`;
        }

        updateTimerDisplay(gameState);
    }

    /**
     * Cập nhật đồng hồ đếm ngược
     */
    function updateTimerDisplay(gameState) {
        if (window.phaseTimerInterval) clearInterval(window.phaseTimerInterval);
        if (!gameState) return; 

        // Tìm timer trong card đang hiển thị
        let visibleTimerDisplay = null;
        if (!waitingSection.classList.contains('hidden')) {
            visibleTimerDisplay = null; // Không có timer ở waiting
        } else if (!votingUiSection.classList.contains('hidden')) {
            visibleTimerDisplay = voteTimerDisplay;
        } else if (!phaseDisplaySection.classList.contains('hidden')) {
            visibleTimerDisplay = phaseTimerDisplay;
        } else if (!roleRevealSection.classList.contains('hidden')) {
            // *** SỬA LỖI 1: Thêm timer cho Role Reveal ***
            visibleTimerDisplay = getEl('role-reveal-timer-display');
        
        // *** SỬA LỖI 2: Thêm timer cho Night Phase (Hành động đêm) ***
        } else if (!interactiveActionSection.classList.contains('hidden')) {
            visibleTimerDisplay = getEl('night-phase-timer-display');
        }
        
        if (!visibleTimerDisplay) return;
        
        const endTime = (gameState.startTime || 0) + (gameState.duration * 1000);

        function updateClock() {
            const remaining = Math.max(0, Math.round((endTime - Date.now()) / 1000));
            if (visibleTimerDisplay) {
                const minutes = Math.floor(remaining / 60);
                const seconds = remaining % 60;
                visibleTimerDisplay.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            }
            if (remaining <= 0) {
                clearInterval(window.phaseTimerInterval);
                if (visibleTimerDisplay) visibleTimerDisplay.textContent = "0:00";
            }
        }
        updateClock();
        window.phaseTimerInterval = setInterval(updateClock, 1000);
    }
    
    /**
     * Hiển thị thẻ vai trò
     */
    function renderRoleCard(roleName, faction) {
        const roleData = allRolesData[roleName] || {};
        getEl('role-name').textContent = roleName;
        getEl('role-description').textContent = roleData.Describe || '...';
        
        const factionEl = getEl('role-faction');
        factionEl.textContent = `Phe ${faction || '?'}`;
        factionEl.className = 'role-faction'; 
        if (faction === 'Bầy Sói') factionEl.classList.add('wolf');
        else if (faction === 'Phe Dân') factionEl.classList.add('villager');
        else if (faction === 'Phe thứ ba') factionEl.classList.add('neutral');
    }

    /**
     * Hiển thị giao diện hành động đêm
     */
    function renderNightActions(myPlayerData, nightNum) {
        interactiveActionSection.innerHTML = ''; 
        
        // *** SỬA LỖI 2: Thêm Timer cho Phase Đêm ***
        // Tạo và thêm bảng timer vào đầu
        const timerEl = document.createElement('div');
        timerEl.className = 'night-timer-display'; // Class này đã có trong player-style.css
        timerEl.innerHTML = `
            <h2>Đêm ${nightNum}</h2>
            <p class="timer">Thời gian còn lại: <strong id="night-phase-timer-display">--</strong></p>
        `;
        interactiveActionSection.appendChild(timerEl);
        // *** KẾT THÚC SỬA LỖI 2 ***

        if (!currentRoomData) {
             console.error("renderNightActions: currentRoomData bị null");
             return;
        }
        
        const role = allRolesData[myPlayerData.roleName] || {};
        const state = myPlayerData.state || {};
        const kind = role.Kind;
        const uiInfo = KIND_UI_MAP[kind] || KIND_UI_MAP['empty'];

        // 1. Kiểm tra Sói (hành động chung)
        if (myPlayerData.faction === 'Bầy Sói') {
            const panel = createActionPanel(
                'Cắn (Bầy Sói)',
                'Chọn một mục tiêu để cả bầy cùng cắn.',
                'wolf_bite'
            );
            // Sói không thể tự cắn
            renderTargetList(panel.content, 'wolf_bite', nightNum, 1, true, (pId) => pId !== myPlayerId); 
            interactiveActionSection.appendChild(panel.panel);
        }

        // 2. Kiểm tra chức năng (Active)
        const nightRule = parseInt(role.Night);
        // "Nếu Active = 0"
        if (role.Active === '0') {
             if (myPlayerData.faction !== 'Bầy Sói') renderRestingPanel();
             return;
        }
        // "Hoặc (Night khác 'n' VÀ Night > đêm hiện tại)"
        if (role.Night !== 'n' && nightRule > nightNum) {
            if (myPlayerData.faction !== 'Bầy Sói') renderRestingPanel();
            return; // Không có chức năng hoặc chưa đến đêm
        }
        // "Hoặc (Active khác 'n' VÀ số lần dùng còn lại <= 0)"
        if (role.Active !== 'n' && (state.activeLeft ?? parseInt(role.Active)) <= 0) {
            if (myPlayerData.faction !== 'Bầy Sói') renderRestingPanel();
            return; // Hết lần dùng
        }


        // 3. Render UI theo Kind
        switch (uiInfo.type) {
            case 'passive':
                if (myPlayerData.faction !== 'Bầy Sói') renderRestingPanel();
                break;
            
            case 'target': // (shield, kill, audit, killwolf, freeze)
                const panel = createActionPanel(uiInfo.title, uiInfo.description, kind);
                const reselect = role.ReSelect === '1';
                const quantity = role.Quantity === 'n' ? 99 : parseInt(role.Quantity);
                // Mặc định là không thể tự target
                renderTargetList(panel.content, kind, nightNum, quantity, reselect, (pId) => pId !== myPlayerId);
                interactiveActionSection.appendChild(panel.panel);
                break;

            case 'witch':
                renderWitchPanel(state, nightNum);
                break;
            
            case 'assassin':
                renderAssassinPanel(nightNum, role.ReSelect === '1');
                break;
            
            case 'curse':
                renderCursePanel(nightNum);
                break;
        }
    }
    
    /**
     * Tạo khung panel hành động
     */
    function createActionPanel(title, description, kind) {
        const panel = document.createElement('div');
        panel.className = 'night-action-panel';
        panel.dataset.kind = kind;
        panel.innerHTML = `
            <div class="panel-header">
                <h2>${title}</h2>
                <p>${description}</p>
            </div>
            <div class="action-content"></div>
            <div class="panel-footer hidden">
                <button class="btn-primary confirm-action-btn">Xác nhận</button>
            </div>
        `;
        return {
            panel: panel,
            content: panel.querySelector('.action-content'),
            footer: panel.querySelector('.panel-footer'),
            confirmBtn: panel.querySelector('.confirm-action-btn')
        };
    }
    
    /**
     * Hiển thị bảng nghỉ ngơi
     */
    function renderRestingPanel() {
        // *** SỬA LỖI: Thay vì ghi đè innerHTML, hãy tạo và nối thêm element ***
        const restingPanel = document.createElement('div');
        restingPanel.className = 'night-action-panel resting-panel';
        restingPanel.innerHTML = `
            <div class="panel-header">
                <h2>Đêm Tĩnh Lặng</h2>
            </div>
            <div class="resting-info">
                <p>Bạn không có hành động nào đêm nay. Hãy nghỉ ngơi...</p>
            </div>`;
        interactiveActionSection.appendChild(restingPanel);
    }

    /**
     * Hiển thị danh sách mục tiêu
     */
    function renderTargetList(container, kind, nightNum, quantity = 1, canReselect = true, filterFunc = null) {
        const grid = document.createElement('div');
        grid.className = 'target-grid';
        
        if (!currentRoomData) return; 
        const roomData = currentRoomData;
        const myPlayerData = roomData.players[myPlayerId] || {}; 
        
        const lastTargetId = myPlayerData.state?.lastTargetId;
        const players = roomData.players || {};
        
        Object.keys(players).forEach(pId => {
            if (!players[pId].isAlive) return; 
            // Áp dụng filter (ví dụ: không tự target)
            if (filterFunc && !filterFunc(pId)) return; 

            const card = document.createElement('div');
            card.className = 'target-card';
            card.dataset.playerId = pId;
            card.innerHTML = `<p class="player-name">${players[pId].username}</p>`;
            
            if (!canReselect && pId === lastTargetId) {
                card.classList.add('disabled');
                card.title = "Không thể chọn lại mục tiêu đêm trước";
            }
            
            card.addEventListener('click', () => {
                if (card.classList.contains('disabled')) return;
                
                const selected = grid.querySelectorAll('.selected');
                
                if (card.classList.contains('selected')) {
                    card.classList.remove('selected');
                } else {
                    if (selected.length < quantity) {
                        card.classList.add('selected');
                    } else if (quantity === 1) {
                        selected.forEach(c => c.classList.remove('selected'));
                        card.classList.add('selected');
                    }
                }

                // Logic gửi action: (Loại bỏ nút 'Confirm' cho đơn giản)
                // Lấy tất cả target đã chọn
                const targets = Array.from(grid.querySelectorAll('.selected')).map(c => c.dataset.playerId);
                
                // (Gửi action lên DB)
                // Sói cắn và các vai trò khác (shield, audit...) đều dùng targetId
                const actionData = { 
                    action: kind, 
                    // Sói (wolf_bite) chỉ nên gửi 1 target
                    targetId: (kind === 'wolf_bite' || quantity === 1) ? targets[0] : targets
                    // (Nếu cần hỗ trợ multi-target, logic backend/frontend cần phức tạp hơn)
                };
                
                // Nếu không chọn ai (bỏ chọn), gửi targetId là null
                if (targets.length === 0) {
                     actionData.targetId = null;
                }
                
                database.ref(`rooms/${currentRoomId}/nightActions/${nightNum}/${myPlayerId}`).set(actionData);
            });
            grid.appendChild(card);
        });

        container.appendChild(grid);
        
        const nightActions = currentRoomData.nightActions?.[nightNum] || {};

        // Hiển thị phiếu bầu của Sói
        if (kind === 'wolf_bite') {
            const wolfVotes = {};
            Object.keys(players).forEach(pId => {
                if (players[pId].faction === 'Bầy Sói' && nightActions[pId]?.targetId) {
                    const targetId = nightActions[pId].targetId;
                    wolfVotes[targetId] = (wolfVotes[targetId] || 0) + 1;
                }
            });
            
            grid.querySelectorAll('.target-card').forEach(card => {
                const pId = card.dataset.playerId;
                if (wolfVotes[pId] > 0) {
                    const countEl = document.createElement('div');
                    countEl.className = 'wolf-vote-count';
                    countEl.textContent = wolfVotes[pId];
                    card.appendChild(countEl);
                }
                if (nightActions[myPlayerId]?.targetId === pId) {
                    card.classList.add('selected');
                }
            });
        } else {
             // Đánh dấu lựa chọn của bản thân cho các vai trò khác
             if (nightActions[myPlayerId]?.action === kind) {
                const myTarget = nightActions[myPlayerId].targetId;
                // (Cần xử lý nếu myTarget là mảng)
                grid.querySelector(`.target-card[data-player-id="${myTarget}"]`)?.classList.add('selected');
             }
        }
    }

    /**
     * Hiển thị giao diện Phù thủy
     */
    function renderWitchPanel(state, nightNum) {
        if (!currentRoomData) return; 
        const roomData = currentRoomData;
        
        const { panel, content, footer } = createActionPanel('Thuốc Phù thủy', 'Bạn có 1 bình Cứu và 1 bình Giết.', 'witch');
        const actionPath = `rooms/${currentRoomId}/nightActions/${nightNum}/${myPlayerId}`;

        const saveUsed = state.witch_save_used || false;
        const killUsed = state.witch_kill_used || false;

        if (saveUsed && killUsed) {
            content.innerHTML = '<p>Bạn đã dùng hết thuốc.</p>';
            interactiveActionSection.appendChild(panel);
            return;
        }

        content.innerHTML = `
            <div class="witch-choice-grid">
                <button class="witch-choice-btn save" id="witch-save-btn" ${saveUsed ? 'disabled' : ''}>
                    <i class="fas fa-heart-pulse"></i> Cứu
                </button>
                <button class="witch-choice-btn kill" id="witch-kill-btn" ${killUsed ? 'disabled' : ''}>
                    <i class="fas fa-skull-crossbones"></i> Giết
                </button>
            </div>
            <div class="target-grid" id="witch-target-grid" style="margin-top: 15px;"></div>
        `;
        
        const targetGrid = content.querySelector('#witch-target-grid');
        const myAction = roomData.nightActions?.[nightNum]?.[myPlayerId];
        
        const renderWitchTargets = (choiceType) => {
            targetGrid.innerHTML = ''; 
            const players = roomData.players || {};
            
            Object.keys(players).forEach(pId => {
                if (players[pId].isAlive) {
                     // Phù thủy có thể tự cứu/giết
                    const card = document.createElement('div');
                    card.className = 'target-card';
                    card.dataset.playerId = pId;
                    card.innerHTML = `<p class="player-name">${players[pId].username}</p>`;
                    
                    card.addEventListener('click', () => {
                        database.ref(actionPath).set({
                            action: 'witch',
                            choice: choiceType,
                            targetId: pId
                        });
                    });
                    
                    if (myAction && myAction.choice === choiceType && myAction.targetId === pId) {
                         card.classList.add('selected');
                    }
                    targetGrid.appendChild(card);
                }
            });
        };

        content.querySelector('#witch-save-btn').addEventListener('click', () => renderWitchTargets('save'));
        content.querySelector('#witch-kill-btn').addEventListener('click', () => renderWitchTargets('kill'));
        
        // Tự động hiển thị target nếu đã chọn
        if (myAction && myAction.action === 'witch') {
             renderWitchTargets(myAction.choice);
        }
        
        interactiveActionSection.appendChild(panel);
    }
    
    /**
     * Hiển thị giao diện Sát thủ
     */
    function renderAssassinPanel(nightNum, canReselect) {
        if (!currentRoomData) return; 
        const roomData = currentRoomData;
        const myPlayerData = roomData.players[myPlayerId] || {};
        
        const { panel, content } = createActionPanel('Ám Sát', 'Chọn mục tiêu, sau đó đoán vai trò.', 'assassin');
        const actionPath = `rooms/${currentRoomId}/nightActions/${nightNum}/${myPlayerId}`;
        const myAction = roomData.nightActions?.[nightNum]?.[myPlayerId];

        const targetGrid = document.createElement('div');
        targetGrid.className = 'target-grid';
        
        const lastTargetId = myPlayerData.state?.lastTargetId;
        const players = roomData.players || {};
        
        Object.keys(players).forEach(pId => {
            if (players[pId].isAlive && pId !== myPlayerId) { 
                const card = document.createElement('div');
                card.className = 'target-card';
                card.dataset.playerId = pId;
                card.innerHTML = `<p class="player-name">${players[pId].username}</p>`;
                
                if (!canReselect && pId === lastTargetId) {
                    card.classList.add('disabled');
                    card.title = "Không thể chọn lại mục tiêu đêm trước";
                }
                
                if (myAction && myAction.targetId === pId) {
                    card.classList.add('selected');
                }
                
                card.addEventListener('click', () => {
                    if (card.classList.contains('disabled')) return;
                    
                    // Reset
                    grid.querySelectorAll('.target-card').forEach(el => el.classList.remove('selected'));
                    content.querySelector('#assassin-guess-grid')?.remove();
                    
                    card.classList.add('selected');
                    // Gửi action (chưa đoán)
                    database.ref(actionPath).set({
                         action: 'assassin',
                         targetId: pId,
                         guessedRole: myAction?.guessedRole || null // Giữ lại vai trò đã đoán nếu có
                    });
                    renderAssassinGuessList(content, pId, nightNum, myAction?.guessedRole);
                });
                targetGrid.appendChild(card);
            }
        });

        content.appendChild(targetGrid);
        
        // Nếu đã chọn target, render lại lưới đoán
        if (myAction && myAction.targetId) {
             renderAssassinGuessList(content, myAction.targetId, nightNum, myAction.guessedRole);
        }
        
        interactiveActionSection.appendChild(panel);
    }
    
    /**
     * Hiển thị danh sách vai trò cho Sát thủ đoán
     */
    function renderAssassinGuessList(container, targetId, nightNum, currentGuess) {
        if (!currentRoomData) return; 
        const roomData = currentRoomData;

        let guessGrid = container.querySelector('#assassin-guess-grid');
        if (!guessGrid) {
            guessGrid = document.createElement('div');
            guessGrid.className = 'choices-grid'; 
            guessGrid.id = 'assassin-guess-grid';
            container.appendChild(guessGrid);
        }
        guessGrid.innerHTML = '<p style="grid-column: 1 / -1; text-align: center; margin-bottom: 0;">Đoán vai trò:</p>';
        
        const rolesInGame = roomData.gameSettings?.roles || [];
        const uniqueRoles = [...new Set(rolesInGame)]; 
        
        uniqueRoles.forEach(roleName => {
            if (roleName === 'Dân thường' || !allRolesData[roleName]) return; // Bỏ qua Dân hoặc vai trò không tồn tại
            
            const btn = document.createElement('button');
            btn.className = 'choice-btn';
            btn.textContent = roleName;
            
            if (currentGuess === roleName) {
                btn.classList.add('selected');
            }
            
            btn.addEventListener('click', () => {
                database.ref(`rooms/${currentRoomId}/nightActions/${nightNum}/${myPlayerId}`).set({
                    action: 'assassin',
                    targetId: targetId,
                    guessedRole: roleName
                });
                // (Cập nhật lại UI sau khi click)
                guessGrid.querySelectorAll('.choice-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
            });
            guessGrid.appendChild(btn);
        });
    }

    /**
     * Hiển thị giao diện Sói Nguyền
     */
    function renderCursePanel(nightNum) {
        if (!currentRoomData) return; 
        const roomData = currentRoomData;

        const { panel, content } = createActionPanel('Nguyền Rủa', 'Bạn có muốn nguyền rủa mục tiêu Sói cắn đêm nay không?', 'curse');
        const actionPath = `rooms/${currentRoomId}/nightActions/${nightNum}/${myPlayerId}`;
        const myAction = roomData.nightActions?.[nightNum]?.[myPlayerId];
        
        content.innerHTML = `
            <div class="witch-choice-grid">
                <button class="witch-choice-btn kill" id="curse-no-btn">
                    <i class="fas fa-times"></i> Không
                </button>
                <button class="witch-choice-btn" id="curse-yes-btn" style="color: #c934e7; border-color: #c934e7;">
                    <i class="fas fa-magic"></i> Nguyền
                </button>
            </div>
            <p style="text-align: center; opacity: 0.7; font-size: 0.9em; margin-top: 10px;">Nếu chọn 'Nguyền', mục tiêu Sói cắn sẽ biến thành Sói thay vì chết.</p>
        `;
        
        const yesBtn = content.querySelector('#curse-yes-btn');
        const noBtn = content.querySelector('#curse-no-btn');
        
        if (myAction && myAction.action === 'curse') {
            if (myAction.choice === 'curse') yesBtn.classList.add('selected');
            if (myAction.choice === 'no_curse') noBtn.classList.add('selected');
        }

        yesBtn.addEventListener('click', () => {
            database.ref(actionPath).set({ action: 'curse', choice: 'curse', targetId: 'wolf_target' }); 
            yesBtn.classList.add('selected');
            noBtn.classList.remove('selected');
        });
        noBtn.addEventListener('click', () => {
            database.ref(actionPath).set({ action: 'curse', choice: 'no_curse', targetId: null });
            noBtn.classList.add('selected');
            yesBtn.classList.remove('selected');
        });
        
        interactiveActionSection.appendChild(panel);
    }

    /**
     * Hiển thị giao diện Biểu Quyết
     */
    function renderVoting(gameState) {
        if (!currentRoomData) return; 
        const roomData = currentRoomData;

        const nightNum = gameState.nightNumber || 0;
        const myVote = roomData.votes?.[nightNum]?.[myPlayerId];
        
        voteTitleDisplay.textContent = `Biểu Quyết Treo Cổ Ngày ${nightNum}`;
        voteOptionsContainer.innerHTML = '';
        
        const players = roomData.players || {};
        Object.keys(players).forEach(pId => {
            if (players[pId].isAlive) {
                const btn = document.createElement('button');
                btn.className = 'choice-btn';
                btn.textContent = players[pId].username;
                btn.dataset.targetId = pId;
                
                if (myVote === pId) btn.classList.add('selected');
                
                btn.addEventListener('click', () => {
                    database.ref(`rooms/${currentRoomId}/votes/${nightNum}/${myPlayerId}`).set(pId);
                });
                voteOptionsContainer.appendChild(btn);
            }
        });
        
        const skipBtn = document.createElement('button');
        skipBtn.className = 'choice-btn btn-secondary';
        skipBtn.textContent = 'Bỏ qua';
        skipBtn.dataset.targetId = 'skip_vote';
        if (myVote === 'skip_vote') skipBtn.classList.add('selected');
        skipBtn.addEventListener('click', () => {
            database.ref(`rooms/${currentRoomId}/votes/${nightNum}/${myPlayerId}`).set('skip_vote');
        });
        voteOptionsContainer.appendChild(skipBtn);
        
        voteStatusMessage.textContent = myVote ? 'Bạn đã bỏ phiếu. Có thể thay đổi.' : 'Hãy bỏ phiếu...';
    }


    // --- 8. LOGIC CHAT ---
    
    function attachChatListeners(roomId) {
        const channels = ['living', 'dead', 'wolves'];
        channels.forEach(channel => {
            const path = `rooms/${roomId}/chat/${channel}`;
            const ref = database.ref(path);
            
            const handler = (snapshot) => {
                const message = snapshot.val();
                if (message) {
                    displayChatMessage(message, channel);
                }
            };
            
            chatListeners[channel] = { ref: ref, handler: handler };
            ref.limitToLast(50).on('child_added', handler);
        });
    }
    
    function displayChatMessage(message, channel) {
        if (channel !== activeChatChannel) {
            return;
        }
        
        const msgEl = document.createElement('div');
        msgEl.className = 'message-item';
        msgEl.dataset.channel = channel;
        
        if (message.isSystem) {
             msgEl.innerHTML = `<span class="system-message"><em>${message.text}</em></span>`;
        } else {
             msgEl.innerHTML = `<span class="message-sender">${message.sender}:</span> <span class="message-text">${message.text}</span>`;
        }
        
        chatMessages.appendChild(msgEl);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
    
    function handleSendMessage() {
        const text = messageInput.value.trim();
        if (!text || !currentRoomId || !myPlayerId) return;
        
        const message = {
            sender: myUsername,
            text: text,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        };
        
        database.ref(`rooms/${currentRoomId}/chat/${activeChatChannel}`).push(message);
        messageInput.value = '';
    }
    
    function switchChatChannel(newChannel) {
        activeChatChannel = newChannel;
        chatChannels.querySelectorAll('.channel-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.channel === newChannel);
        });
        chatMessages.innerHTML = '';
        // (Nên tải lại lịch sử chat ở đây)
    }

    /**
     * Cập nhật hiển thị kênh chat (Sói, Chết)
     */
    function updateChatChannels(myPlayerData, phase) {
        const wolfChannel = chatChannels.querySelector('[data-channel="wolves"]');
        const deadChannel = chatChannels.querySelector('[data-channel="dead"]');

        if (!myPlayerData || !phase) return;

        if (myPlayerData.faction === 'Bầy Sói' && phase !== 'waiting' && phase !== 'DAY_1_INTRO') {
            wolfChannel.classList.remove('hidden');
        } else {
            wolfChannel.classList.add('hidden');
            if (activeChatChannel === 'wolves') switchChatChannel('living'); 
        }
        
        if (!myPlayerData.isAlive) {
            deadChannel.classList.remove('hidden');
            if (activeChatChannel !== 'dead') switchChatChannel('dead'); 
        } else {
            deadChannel.classList.add('hidden');
            if (activeChatChannel === 'dead') switchChatChannel('living');
        }
    }

    // --- 9. LOGIC HOST ACTIONS (GỌI API) ---
    
    /**
     * Gửi yêu cầu hành động của Host lên server
     */
    async function handleHostAction(action, payload = {}) {
        if (!isHost || !currentRoomId) return;
        
        const btn = event?.target;
        if (btn) btn.disabled = true;
        
        try {
            const response = await fetch('/api/host-actions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: action,
                    roomId: currentRoomId,
                    username: myUsername, 
                    ...payload
                })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || `Lỗi thực hiện ${action}`);
            
            if (action === 'delete-room') {
                alert("Đã xóa phòng.");
                sessionStorage.removeItem('mywolf_roomid');
                cleanupListeners();
                showLobby();
            }

        } catch (e) {
            console.error(`Lỗi ${action}:`, e);
            alert(e.message);
        } finally {
            if (btn) btn.disabled = false;
        }
    }
    
    // --- 10. CÁC HÀM TIỆN ÍCH (DI CHÚC, MODALS) ---
    
    function openWillModal() {
        if (!currentRoomId || !myPlayerId) return;
        const willRef = database.ref(`rooms/${currentRoomId}/players/${myPlayerId}/will/content`);
        willRef.once('value').then(snapshot => {
            getEl('will-textarea').value = snapshot.val() || '';
            updateWordCount();
            getEl('save-will-status').textContent = '';
            willWritingModal.classList.remove('hidden');
        });
    }
    
    function saveWill() {
        if (!currentRoomId || !myPlayerId) return;
        const willText = getEl('will-textarea').value;
        const words = countWords(willText);
        if (words > 100) {
            getEl('save-will-status').textContent = 'Di chúc quá dài, vui lòng rút gọn!';
            return;
        }
        
        const saveBtn = getEl('save-will-btn');
        saveBtn.disabled = true;
        getEl('save-will-status').textContent = 'Đang lưu...';
        
        const willData = {
            content: willText,
            lastUpdated: firebase.database.ServerValue.TIMESTAMP
        };
        database.ref(`rooms/${currentRoomId}/players/${myPlayerId}/will`).set(willData)
            .then(() => {
                getEl('save-will-status').textContent = 'Đã lưu thành công!';
                setTimeout(() => {
                    willWritingModal.classList.add('hidden');
                    saveBtn.disabled = false;
                }, 1500);
            })
            .catch(err => {
                getEl('save-will-status').textContent = 'Lỗi: ' + err.message;
                saveBtn.disabled = false;
            });
    }

    function updateWordCount() {
        const text = getEl('will-textarea').value;
        const words = countWords(text);
        getEl('will-word-count').textContent = `${words}/100 từ`;
        if (words > 100) {
            getEl('will-word-count').style.color = 'var(--wolf-color)';
            getEl('save-will-btn').disabled = true;
        } else {
            getEl('will-word-count').style.color = 'var(--light-text)';
            getEl('save-will-btn').disabled = false;
        }
    }
    
    const countWords = (text) => {
        if (!text) return 0;
        return text.trim().split(/\s+/).filter(word => word.length > 0).length;
    };
    
    function showRoleDescriptionModal(roleName) {
        const roleData = allRolesData[roleName];
        if (roleData) {
            getEl('modal-role-name').textContent = roleData.RoleName;
            getEl('modal-role-faction').textContent = `Phe: ${roleData.Faction}`;
            getEl('modal-role-description').textContent = roleData.Describe;
            roleDescriptionModal.classList.remove('hidden');
        }
    }

    let lastAnnounceTimestamp = 0;
    function showAnnouncement(data) {
        if (!data || data.timestamp <= lastAnnounceTimestamp) return;
        lastAnnounceTimestamp = data.timestamp;
        
        const content = getEl('announcement-content');
        if (content) {
            content.textContent = data.message;
            announcementModal.classList.remove('hidden');
        }
        
        if (phaseResults.closest('.game-card:not(.hidden)')) {
             phaseResults.innerHTML = `<p>${data.message}</p>`;
        }
    }
    
    function updatePrivateLog(privateData) {
        privateLogSection.classList.remove('hidden');
        privateLogContent.innerHTML = '';
        
        const sortedKeys = Object.keys(privateData).sort((a, b) => {
            const nightA = parseInt(a.split('_')[1] || 0);
            const nightB = parseInt(b.split('_')[1] || 0);
            return nightA - nightB;
        });
        
        sortedKeys.forEach(key => {
            const data = privateData[key];
            const nightNum = key.split('_')[1] || '?';
            const p = document.createElement('p');
            p.className = 'log-entry';
            p.innerHTML = `<strong>[Đêm ${nightNum}]</strong><br>${data.message}`;
            privateLogContent.appendChild(p);
        });
    }

    // --- 11. CHẠY KHỞI TẠO ---
    initialize();
});