document.addEventListener('DOMContentLoaded', () => {
    const fetchRoomsBtn = document.getElementById('fetch-rooms-btn');
    const roomListDiv = document.getElementById('room-list-sa');
    const loadingMessage = document.getElementById('loading-message');

    // Lấy mật khẩu SA đã lưu khi đăng nhập
    const saPassword = sessionStorage.getItem('mywolf_sa_pass');

    if (!saPassword) {
        alert("Không tìm thấy thông tin xác thực. Vui lòng đăng nhập lại.");
        window.location.href = 'index.html';
        return;
    }

    // --- Hàm tải danh sách phòng ---
    const loadRooms = async () => {
        loadingMessage.classList.remove('hidden');
        roomListDiv.innerHTML = '';
        
        try {
            // 1. Gọi API /api/room (API này đã tồn tại)
            const response = await fetch('/api/room');
            if (!response.ok) throw new Error('Không thể tải danh sách phòng.');
            
            const rooms = await response.json();
            
            if (rooms.length === 0) {
                roomListDiv.innerHTML = '<p>Không có phòng nào đang hoạt động.</p>';
                return;
            }

            // 2. Hiển thị phòng
            rooms.forEach(room => {
                const roomEl = document.createElement('div');
                roomEl.className = 'room-item';
                roomEl.id = `room-${room.id}`;
                roomEl.innerHTML = `
                    <div class="room-details">
                        <strong>Phòng: ${room.id}</strong>
                        <span>Trạng thái: ${room.status}</span>
                        <span>Người chơi: ${room.playerCount}</span>
                    </div>
                    <button class="delete-room-btn" data-room-id="${room.id}">XÓA PHÒNG</button>
                `;
                roomListDiv.appendChild(roomEl);
            });

        } catch (err) {
            roomListDiv.innerHTML = `<p class="error-message">${err.message}</p>`;
        } finally {
            loadingMessage.classList.add('hidden');
        }
    };

    // --- Hàm xử lý Xóa phòng ---
    const handleDeleteRoom = async (e) => {
        if (!e.target.classList.contains('delete-room-btn')) return;

        const roomId = e.target.dataset.roomId;
        if (!confirm(`Bạn có chắc chắn muốn XÓA PHÒNG ${roomId} không? Hành động này không thể hoàn tác.`)) {
            return;
        }

        e.target.disabled = true;
        e.target.textContent = 'Đang xóa...';

        try {
            // Gọi API mới (sẽ tạo ở bước 5)
            const response = await fetch('/api/super-admin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'delete-room',
                    roomId: roomId,
                    password: saPassword // Gửi mật khẩu SA để xác thực
                })
            });

            const data = await response.json();
            if (!response.ok || !data.success) {
                throw new Error(data.message || 'Xóa phòng thất bại.');
            }

            // Xóa khỏi UI
            document.getElementById(`room-${roomId}`).remove();
            alert(`Đã xóa phòng ${roomId} thành công.`);

        } catch (err) {
            alert(err.message);
            e.target.disabled = false;
            e.target.textContent = 'XÓA PHÒNG';
        }
    };

    // Gắn sự kiện
    fetchRoomsBtn.addEventListener('click', loadRooms);
    roomListDiv.addEventListener('click', handleDeleteRoom);

    // Tải phòng ngay khi vào trang
    loadRooms();
});