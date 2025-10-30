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
    // Assassin modal (loại bỏ vì logic assassin mới sẽ render khác)
    
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
            const rolesArray = await response.json();
            allRolesData = rolesArray.reduce((acc, role) => {
                acc[role.RoleName] = role;
                return acc;
            }, {});
        } catch (e) {
            console.error("Lỗi tải dữ liệu Roles:", e);
            alert("Lỗi nghiêm trọng: Không thể tải dữ liệu vai trò từ Google Sheets.");
            return;
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
            // Giả sử có API endpoint '/api/host-actions'
            const response = await fetch('/api/host-actions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'create-room',
                    username: myUsername, // Gửi username để server biết ai là host
                    isPrivate: isPrivate,
                    password: password
                })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Lỗi khi tạo phòng');

            // Tạo phòng thành công, tự động tham gia
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
        selectedRoomToJoin = roomId; // Lưu lại phòng đang định vào

        if (isPrivate) {
            // Hiển thị ô nhập mật khẩu
            joinPasswordSection.classList.remove('hidden');
            joinPasswordInput.value = '';
            confirmJoinRoomBtn.onclick = () => handleConfirmJoinRoom(true);
        } else {
            // Vào phòng public
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
             // Giả sử có API endpoint '/api/host-actions'
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
            
            // Vào phòng thành công
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
    }

    /**
     * Gắn listener chính vào phòng game
     */
    function attachMainRoomListener(roomId) {
        cleanupListeners(); // Hủy listener cũ trước
        currentRoomId = roomId;
        const roomRef = database.ref(`rooms/${roomId}`);
        
        mainRoomListener = roomRef.on('value', (snapshot) => {
            const roomData = snapshot.val();
            
            // Nếu phòng bị xóa (do host xóa)
            if (!roomData) {
                alert("Phòng đã bị xóa bởi Host.");
                sessionStorage.removeItem('mywolf_roomid');
                cleanupListeners();
                showLobby();
                return;
            }

            // Tìm thông tin của bản thân
            myPlayerId = Object.keys(roomData.players).find(pId => roomData.players[pId].username === myUsername);
            if (!myPlayerId) {
                // Bị kick?
                alert("Bạn đã bị kick khỏi phòng.");
                sessionStorage.removeItem('mywolf_roomid');
                cleanupListeners();
                showLobby();
                return;
            }
            
            const myPlayerData = roomData.players[myPlayerId];
            isHost = (myPlayerId === roomData.hostId);

            // Cập nhật UI chung
            roomIdDisplay.textContent = roomId;
            hostNameDisplay.textContent = roomData.players[roomData.hostId]?.username || '...';
            updatePlayerList(roomData.players);
            updateHostControls(roomData);
            updateMainUI(roomData, myPlayerData); // Hàm chính điều khiển giao diện
            updateChatChannels(myPlayerData, roomData.gameState?.phase); // Cập nhật kênh chat (Sói)
            
            // Cập nhật thông báo
            if (roomData.publicData?.latestAnnouncement) {
                showAnnouncement(roomData.publicData.latestAnnouncement);
            }
            // Cập nhật log riêng
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
                    ${pId === isHost ? ' (Host)' : ''}
                </span>
                ${(isHost && pId !== myPlayerId) ? `<button class="player-kick-btn" data-player-id="${pId}">Kick</button>` : ''}
            `;
            playerListIngame.appendChild(li);
        }
        playerCountDisplay.textContent = count;
        playerCountInRoom.textContent = count; // Cập nhật cho host
        
        // Thêm listener cho nút kick
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
            hostDeleteRoomBtn.classList.remove('hidden'); // Host có thể xóa phòng khi đang chờ
            
            // Render danh sách vai trò
            if (!roleSelectionGrid.hasChildNodes()) {
                renderRoleSelection();
            }
            updateRoleSelectionCount(); // Cập nhật số lượng
            
            // Kiểm tra điều kiện start
            const playerCount = Object.keys(roomData.players).length;
            const rolesSelected = (roomData.gameSettings?.roles || []).length;
            const hasWolf = (roomData.gameSettings?.roles || []).some(roleName => allRolesData[roleName]?.Faction === 'Bầy Sói');
            
            if (playerCount >= 4 && playerCount === rolesSelected && hasWolf) {
                hostStartGameBtn.disabled = false;
            } else {
                hostStartGameBtn.disabled = true;
            }

        } else if (phase === 'GAME_END') {
            hostLobbyControls.classList.add('hidden');
            hostGameplayControls.classList.remove('hidden');
            hostDeleteRoomBtn.classList.remove('hidden');
            hostSkipPhaseBtn.classList.add('hidden'); // Không skip khi game đã end
            hostStartGameBtn.classList.add('hidden');
        } else {
            // Đang trong game
            hostLobbyControls.classList.add('hidden');
            hostGameplayControls.classList.remove('hidden');
            hostDeleteRoomBtn.classList.add('hidden'); // Không cho xóa phòng khi đang chơi
            hostSkipPhaseBtn.classList.remove('hidden');
            hostStartGameBtn.classList.add('hidden');
        }
    }

    /**
     * Render các checkbox chọn vai trò cho Host
     */
    function renderRoleSelection() {
        roleSelectionGrid.innerHTML = '';
        // Bỏ qua Dân Thường (hàng 2) và Sói (hàng 3)
        const defaultRoles = [allRolesData['Dân thường']?.RoleName, allRolesData['Sói thường']?.RoleName];

        for (const roleName in allRolesData) {
            if (defaultRoles.includes(roleName)) continue;
            
            const role = allRolesData[roleName];
            const div = document.createElement('div');
            div.className = 'role-selection-item'; // Cần CSS cho class này
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
        
        // Luôn thêm 1 Sói
        const wolfRoleName = "Sói thường"; // Lấy từ sheet (hàng 3)
        if (allRolesData[wolfRoleName]) {
            selectedRoles.push(wolfRoleName);
        }
        
        // Thêm Dân thường cho đủ
        const civilianRoleName = "Dân thường"; // Lấy từ sheet (hàng 2)
        const civilianCount = playerCount - selectedRoles.length;
        if (allRolesData[civilianRoleName]) {
            for (let i = 0; i < civilianCount; i++) {
                selectedRoles.push(civilianRoleName);
            }
        }
        
        roleCountSelected.textContent = selectedRoles.length;
        
        // Cập nhật cài đặt game lên Firebase
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
                waitingMessage.textContent = "Trạng thái không xác định.";
        }

        // Cập nhật Timer (nếu có)
        updateTimerDisplay(gameState);
    }

    /**
     * Cập nhật đồng hồ đếm ngược
     */
    function updateTimerDisplay(gameState) {
        // Hủy timer cũ (nếu có)
        if (window.phaseTimerInterval) clearInterval(window.phaseTimerInterval);
        
        const timerElement = phaseTimerDisplay.closest('.game-card:not(.hidden)')?.querySelector('.timer');
        if (!timerElement) return; // Không có timer cho phase này
        
        const endTime = (gameState.startTime || 0) + (gameState.duration * 1000);

        function updateClock() {
            const remaining = Math.max(0, Math.round((endTime - Date.now()) / 1000));
            if (timerElement) {
                timerElement.textContent = `${remaining}s`;
            }
            if (remaining <= 0) {
                clearInterval(window.phaseTimerInterval);
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
        getEl('role-description').textContent = roleData.Describe || 'Không có mô tả.';
        
        const factionEl = getEl('role-faction');
        factionEl.textContent = `Phe ${faction}`;
        factionEl.className = 'role-faction'; // Reset
        if (faction === 'Bầy Sói') factionEl.classList.add('wolf');
        else if (faction === 'Phe Dân') factionEl.classList.add('villager');
        else if (faction === 'Phe thứ ba') factionEl.classList.add('neutral');
        // (Thêm icon nếu muốn)
    }

    /**
     * Hiển thị giao diện hành động đêm
     */
    function renderNightActions(myPlayerData, nightNum) {
        interactiveActionSection.innerHTML = ''; // Xóa hành động cũ
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
            renderTargetList(panel.content, 'wolf_bite', nightNum, 1, false, (pId) => pId !== myPlayerId); // Sói có thể tự cắn
            interactiveActionSection.appendChild(panel.panel);
        }

        // 2. Kiểm tra chức năng (Active)
        const nightRule = parseInt(role.Night);
        if (role.Active === '0' || (role.Night !== 'n' && nightRule > nightNum)) {
            if (myPlayerData.faction !== 'Bầy Sói') renderRestingPanel();
            return; // Không có chức năng hoặc chưa đến đêm
        }
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
                renderTargetList(panel.content, kind, nightNum, quantity, reselect);
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
        interactiveActionSection.innerHTML = `
            <div class="night-action-panel resting-panel">
                <div class="panel-header">
                    <h2>Đêm Tĩnh Lặng</h2>
                </div>
                <div class="resting-info">
                    <p>Bạn không có hành động nào đêm nay. Hãy nghỉ ngơi...</p>
                </div>
            </div>`;
    }

    /**
     * Hiển thị danh sách mục tiêu
     */
    function renderTargetList(container, kind, nightNum, quantity = 1, canReselect = true, filterFunc = null) {
        const grid = document.createElement('div');
        grid.className = 'target-grid';
        
        const lastTargetId = myPlayerData.state?.lastTargetId;
        const players = roomData.players || {};
        
        Object.keys(players).forEach(pId => {
            if (!players[pId].isAlive) return; // Bỏ qua người chết
            if (filterFunc && !filterFunc(pId)) return; // Bỏ qua theo filter (ví dụ: Sói tự cắn)

            const card = document.createElement('div');
            card.className = 'target-card';
            card.dataset.playerId = pId;
            card.innerHTML = `<p class="player-name">${players[pId].username}</p>`;
            
            // Xử lý ReSelect
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
                // Cập nhật nút xác nhận (nếu có)
                const footer = container.closest('.night-action-panel').querySelector('.panel-footer');
                const confirmBtn = footer?.querySelector('.confirm-action-btn');
                if (confirmBtn) {
                    footer.classList.remove('hidden');
                    confirmBtn.disabled = grid.querySelectorAll('.selected').length === 0;
                    confirmBtn.onclick = () => {
                        const targets = Array.from(grid.querySelectorAll('.selected')).map(c => c.dataset.playerId);
                        const actionData = {
                            action: kind, // Mặc dù kind là 'kill', action của Sói là 'wolf_bite'
                            targetId: targets[0] // Logic Sói chỉ chọn 1
                        };
                        
                        if (kind === 'wolf_bite') {
                             database.ref(`rooms/${currentRoomId}/nightActions/${nightNum}/${myPlayerId}`).set(actionData);
                        } else {
                             // Xử lý cho các vai trò khác (nếu cần nút confirm)
                        }
                    };
                } else {
                    // Nếu không có nút confirm (chọn là gửi)
                    const targetId = card.dataset.playerId;
                    const actionData = { action: kind, targetId: targetId };
                    database.ref(`rooms/${currentRoomId}/nightActions/${nightNum}/${myPlayerId}`).set(actionData);
                }
            });
            grid.appendChild(card);
        });

        container.appendChild(grid);
        
        // Hiển thị phiếu bầu của Sói
        if (kind === 'wolf_bite') {
            const nightActions = roomData.nightActions?.[nightNum] || {};
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
                // Đánh dấu lựa chọn của bản thân
                if (nightActions[myPlayerId]?.targetId === pId) {
                    card.classList.add('selected');
                }
            });
        } else {
            // Đánh dấu lựa chọn của bản thân cho các vai trò khác
             if (nightActions[myPlayerId]?.action === kind) {
                const myTarget = nightActions[myPlayerId].targetId;
                grid.querySelector(`.target-card[data-player-id="${myTarget}"]`)?.classList.add('selected');
             }
        }
    }

    /**
     * Hiển thị giao diện Phù thủy
     */
    function renderWitchPanel(state, nightNum) {
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
        
        const renderWitchTargets = (choiceType) => {
            targetGrid.innerHTML = ''; // Xóa mục tiêu cũ
            const players = roomData.players || {};
            
            Object.keys(players).forEach(pId => {
                if (players[pId].isAlive) {
                    const card = document.createElement('div');
                    card.className = 'target-card';
                    card.dataset.playerId = pId;
                    card.innerHTML = `<p class="player-name">${players[pId].username}</p>`;
                    
                    card.addEventListener('click', () => {
                        // Gửi hành động
                        database.ref(actionPath).set({
                            action: 'witch',
                            choice: choiceType,
                            targetId: pId
                        });
                    });
                    targetGrid.appendChild(card);
                }
            });
            
            // Đánh dấu lựa chọn hiện tại (nếu có)
            const myAction = roomData.nightActions?.[nightNum]?.[myPlayerId];
            if (myAction && myAction.choice === choiceType) {
                targetGrid.querySelector(`.target-card[data-player-id="${myAction.targetId}"]`)?.classList.add('selected');
            }
        };

        content.querySelector('#witch-save-btn').addEventListener('click', () => renderWitchTargets('save'));
        content.querySelector('#witch-kill-btn').addEventListener('click', () => renderWitchTargets('kill'));
        
        interactiveActionSection.appendChild(panel);
    }
    
    /**
     * Hiển thị giao diện Sát thủ
     */
    function renderAssassinPanel(nightNum, canReselect) {
        const { panel, content } = createActionPanel('Ám Sát', 'Chọn mục tiêu, sau đó đoán vai trò.', 'assassin');
        const actionPath = `rooms/${currentRoomId}/nightActions/${nightNum}/${myPlayerId}`;
        const myAction = roomData.nightActions?.[nightNum]?.[myPlayerId];

        // Bước 1: Chọn mục tiêu
        const targetGrid = document.createElement('div');
        targetGrid.className = 'target-grid';
        
        const lastTargetId = myPlayerData.state?.lastTargetId;
        const players = roomData.players || {};
        
        Object.keys(players).forEach(pId => {
            if (players[pId].isAlive && pId !== myPlayerId) { // Không tự ám sát
                const card = document.createElement('div');
                card.className = 'target-card';
                card.dataset.playerId = pId;
                card.innerHTML = `<p class="player-name">${players[pId].username}</p>`;
                
                if (!canReselect && pId === lastTargetId) {
                    card.classList.add('disabled');
                    card.title = "Không thể chọn lại mục tiêu đêm trước";
                }
                
                // Nếu đã chọn mục tiêu này, hiển thị modal đoán
                if (myAction && myAction.targetId === pId) {
                    card.classList.add('selected');
                    // Hiển thị modal (hoặc lưới đoán)
                    renderAssassinGuessList(content, pId, nightNum, myAction.guessedRole);
                }
                
                card.addEventListener('click', () => {
                    if (card.classList.contains('disabled')) return;
                    // Xóa lựa chọn cũ
                    content.querySelectorAll('.target-card, .choices-grid').forEach(el => el.classList.remove('selected'));
                    content.querySelector('#assassin-guess-grid')?.remove();
                    // Chọn mới
                    card.classList.add('selected');
                    renderAssassinGuessList(content, pId, nightNum);
                });
                targetGrid.appendChild(card);
            }
        });

        content.appendChild(targetGrid);
        interactiveActionSection.appendChild(panel);
    }
    
    /**
     * Hiển thị danh sách vai trò cho Sát thủ đoán
     */
    function renderAssassinGuessList(container, targetId, nightNum, currentGuess) {
        let guessGrid = container.querySelector('#assassin-guess-grid');
        if (!guessGrid) {
            guessGrid = document.createElement('div');
            guessGrid.className = 'choices-grid'; // Tận dụng CSS của vote
            guessGrid.id = 'assassin-guess-grid';
            container.appendChild(guessGrid);
        }
        guessGrid.innerHTML = '<p style="grid-column: 1 / -1; text-align: center; margin-bottom: 0;">Đoán vai trò:</p>';
        
        const rolesInGame = roomData.gameSettings?.roles || [];
        const uniqueRoles = [...new Set(rolesInGame)]; // Lấy các vai trò duy nhất
        
        uniqueRoles.forEach(roleName => {
            if (roleName === 'Dân thường') return; // Bỏ qua Dân thường
            
            const btn = document.createElement('button');
            btn.className = 'choice-btn';
            btn.textContent = roleName;
            
            if (currentGuess === roleName) {
                btn.classList.add('selected');
            }
            
            btn.addEventListener('click', () => {
                // Gửi hành động
                database.ref(`rooms/${currentRoomId}/nightActions/${nightNum}/${myPlayerId}`).set({
                    action: 'assassin',
                    targetId: targetId,
                    guessedRole: roleName
                });
            });
            guessGrid.appendChild(btn);
        });
    }

    /**
     * Hiển thị giao diện Sói Nguyền
     */
    function renderCursePanel(nightNum) {
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
            database.ref(actionPath).set({ action: 'curse', choice: 'curse', targetId: 'wolf_target' }); // TargetId tạm
        });
        noBtn.addEventListener('click', () => {
            database.ref(actionPath).set({ action: 'curse', choice: 'no_curse', targetId: null });
        });
        
        interactiveActionSection.appendChild(panel);
    }

    /**
     * Hiển thị giao diện Biểu Quyết
     */
    function renderVoting(gameState) {
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
        
        // Thêm nút bỏ qua
        const skipBtn = document.createElement('button');
        skipBtn.className = 'choice-btn btn-secondary';
        skipBtn.textContent = 'Bỏ qua';
        skipBtn.dataset.targetId = 'skip_vote';
        if (myVote === 'skip_vote') skipBtn.classList.add('selected');
        skipBtn.addEventListener('click', () => {
            database.ref(`rooms/${currentRoomId}/votes/${nightNum}/${myPlayerId}`).set('skip_vote');
        });
        voteOptionsContainer.appendChild(skipBtn);
        
        voteStatusMessage.textContent = myVote ? 'Bạn có thể thay đổi phiếu.' : 'Hãy bỏ phiếu...';
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
            
            // Lắng nghe tin nhắn mới
            chatListeners[channel] = { ref: ref, handler: handler };
            ref.limitToLast(50).on('child_added', handler);
        });
    }
    
    function displayChatMessage(message, channel) {
        if (channel !== activeChatChannel) {
            // (Thêm logic thông báo tin nhắn mới ở kênh khác nếu muốn)
            return;
        }
        
        const msgEl = document.createElement('div');
        msgEl.className = 'message-item';
        msgEl.dataset.channel = channel;
        
        // (Thêm logic kiểm tra tin nhắn hệ thống)
        if (message.isSystem) {
             msgEl.innerHTML = `<span class="system-message"><em>${message.text}</em></span>`;
        } else {
             msgEl.innerHTML = `<span class="message-sender">${message.sender}:</span> <span class="message-text">${message.text}</span>`;
        }
        
        chatMessages.appendChild(msgEl);
        // Tự động cuộn xuống dưới
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
        // Cập nhật UI nút
        chatChannels.querySelectorAll('.channel-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.channel === newChannel);
        });
        // Tải lại tin nhắn
        chatMessages.innerHTML = '';
        // (Bạn có thể thêm logic tải lịch sử chat ở đây)
    }

    /**
     * Cập nhật hiển thị kênh chat (Sói, Chết)
     */
    function updateChatChannels(myPlayerData, phase) {
        const wolfChannel = chatChannels.querySelector('[data-channel="wolves"]');
        const deadChannel = chatChannels.querySelector('[data-channel="dead"]');

        // Kênh Sói
        if (myPlayerData.faction === 'Bầy Sói' && phase !== 'waiting') {
            wolfChannel.classList.remove('hidden');
        } else {
            wolfChannel.classList.add('hidden');
            if (activeChatChannel === 'wolves') switchChatChannel('living'); // Chuyển về kênh Sống nếu Sói bị ẩn
        }
        
        // Kênh Chết
        if (!myPlayerData.isAlive) {
            deadChannel.classList.remove('hidden');
            if (activeChatChannel !== 'dead') switchChatChannel('dead'); // Tự động chuyển sang kênh Chết
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
        
        // Vô hiệu hóa nút để tránh double-click
        const btn = event?.target;
        if (btn) btn.disabled = true;
        
        try {
            const response = await fetch('/api/host-actions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: action,
                    roomId: currentRoomId,
                    username: myUsername, // Để xác thực Host
                    ...payload
                })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || `Lỗi thực hiện ${action}`);
            
            // Nếu là 'delete-room', xử lý ở client
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
        
        // Cập nhật kết quả vào phase-results (nếu đang ở phase đó)
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
