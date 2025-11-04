// File: script.js
// Xử lý logic cho index.html (Đăng nhập & Đăng ký)

document.addEventListener('DOMContentLoaded', function() {
    // --- Các phần tử DOM ---
    const loginView = document.getElementById('login-view');
    const registerView = document.getElementById('register-view');
    
    const loginButton = document.getElementById('loginButton');
    const playerPassword = document.getElementById('playerPassword');
    const loginError = document.getElementById('loginError');

    const registerButton = document.getElementById('registerButton');
    const newUsername = document.getElementById('newUsername');
    const newPassword = document.getElementById('newPassword');
    const registerMessage = document.getElementById('registerMessage');

    const showRegisterLink = document.getElementById('show-register-link');
    const showLoginLink = document.getElementById('show-login-link');
    
    // Nút đăng nhập Admin (Super Admin)
    const adminButton = document.getElementById('adminButton');
    const adminPassword = document.getElementById('adminPassword');

    // --- Chức năng chuyển đổi giữa form Đăng nhập và Đăng ký ---
    if (showRegisterLink && showLoginLink && loginView && registerView) {
        showRegisterLink.addEventListener('click', (e) => {
            e.preventDefault();
            loginView.classList.add('hidden');
            registerView.classList.remove('hidden');
            loginError.textContent = '';
            registerMessage.textContent = '';
        });

        showLoginLink.addEventListener('click', (e) => {
            e.preventDefault();
            registerView.classList.add('hidden');
            loginView.classList.remove('hidden');
            loginError.textContent = '';
            registerMessage.textContent = '';
        });
    }

    // --- Xử lý Đăng ký người chơi mới ---
    const handleRegister = () => {
        const username = newUsername.value.trim();
        const password = newPassword.value.trim();

        if (!username || !password) {
            registerMessage.textContent = 'Tên và mật khẩu không được để trống.';
            registerMessage.classList.add('error-message');
            return;
        }
        if (/\s/.test(username)) {
             registerMessage.textContent = 'Tên người chơi không được chứa khoảng trắng.';
             registerMessage.classList.add('error-message');
             return;
        }
        
        registerMessage.textContent = '';
        registerButton.disabled = true;
        registerButton.textContent = 'Đang xử lý...';

        // SỬ DỤNG ĐƯỜNG DẪN TƯƠNG ĐỐI
        fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'register', username, password })
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                registerMessage.textContent = 'Đăng ký thành công! Đang chuyển về trang đăng nhập...';
                registerMessage.classList.remove('error-message');
                registerMessage.classList.add('message');
                setTimeout(() => {
                    playerPassword.value = password; // Tự điền mật khẩu vừa tạo
                    if (showLoginLink) showLoginLink.click();
                    loginError.textContent = 'Hãy đăng nhập với mật khẩu vừa tạo.';
                }, 2000);
            } else {
                registerMessage.textContent = data.message || 'Đã có lỗi xảy ra.';
                registerMessage.classList.add('error-message');
            }
        })
        .catch(err => {
            console.error('Error:', err);
            registerMessage.textContent = 'Lỗi kết nối máy chủ.';
            registerMessage.classList.add('error-message');
        })
        .finally(() => {
            registerButton.disabled = false;
            registerButton.textContent = 'Tạo Tài Khoản';
        });
    };

    if (registerButton && newPassword && newUsername) {
        registerButton.addEventListener('click', handleRegister);
        newPassword.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleRegister(); });
        newUsername.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleRegister(); });
    }

    // --- Xử lý đăng nhập người chơi ---
    const handleLogin = () => {
        const password = playerPassword.value;
        if (!password) {
            loginError.textContent = 'Vui lòng nhập mật khẩu!';
            return;
        }
        loginError.textContent = '';
        loginButton.disabled = true;

        // SỬ DỤNG ĐƯỜNG DẪN TƯƠNG ĐỐI
        fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'login', password: password, type: 'player' })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success && data.username) {
                // *** SỬA ĐỔI TẠI ĐÂY ***
                // Lưu tên người dùng vào localStorage để không bị mất khi đóng tab
                localStorage.setItem('mywolf_username', data.username);
                // *** KẾT THÚC SỬA ĐỔI ***
                
                // Chuyển hướng đến trang sảnh chờ/game
                window.location.href = 'player.html';
            } else {
                loginError.textContent = data.message || 'Mật khẩu không chính xác!';
                loginButton.disabled = false;
            }
        })
        .catch(error => {
            console.error('Error:', error);
            loginError.textContent = 'Có lỗi xảy ra khi đăng nhập!';
            loginButton.disabled = false;
        });
    };

    if (loginButton && playerPassword) {
        loginButton.addEventListener('click', handleLogin);
        playerPassword.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleLogin(); });
    }

    // --- Xử lý đăng nhập Super Admin ---
    const handleAdminLogin = () => {
        const password = adminPassword.value;
        if (!password) {
            alert('Vui lòng nhập mật khẩu Super Admin!');
            return;
        }
        adminButton.disabled = true;
        
        // SỬ DỤNG ĐƯỜNG DẪN TƯƠNG ĐỐI
        fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'login', password: password, type: 'super_admin' })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // ===============================================
                // === SỬA LỖI TẠI ĐÂY ===
                // ===============================================
                // Lưu mật khẩu vào sessionStorage để dùng ở trang sau
                sessionStorage.setItem('mywolf_sa_pass', password);
                // Chuyển hướng đến trang super-admin.html
                window.location.href = 'super-admin.html';
                // ===============================================
                // === KẾT THÚC SỬA LỖI ===
                // ===============================================
            } else {
                alert('Mật khẩu Super Admin không chính xác!');
            }
        })
        .catch(error => console.error('Error:', error))
        .finally(() => adminButton.disabled = false);
    };
    
    if (adminButton && adminPassword) {
        adminButton.addEventListener('click', handleAdminLogin);
        adminPassword.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleAdminLogin(); });
    }
});