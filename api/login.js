// File: /api/login.js
import { google } from 'googleapis';

// --- Hàm helper để lấy thông tin xác thực và ID sheet từ biến môi trường ---
function getGoogleSheetConfig() {
    // Đảm bảo biến môi trường có tên đúng
    if (!process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS || !process.env.GOOGLE_SHEET_ID) {
        throw new Error('Google Sheets credentials or Spreadsheet ID are not set in environment variables.');
    }
    try {
        const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS);
        const spreadsheetId = process.env.GOOGLE_SHEET_ID;
        return { credentials, spreadsheetId };
    } catch (e) {
        console.error("Could not parse Google credentials JSON:", e);
        throw new Error('Could not parse Google credentials JSON.');
    }
}

// === BẢN VÁ: Thêm hàm helper tạo auth mới mỗi lần ===
async function getGoogleSheetsAPI_local_login(scopes) {
    try {
        const { credentials } = getGoogleSheetConfig();
        // Tạo đối tượng auth mới mỗi lần
        const googleAuth = new google.auth.GoogleAuth({
            credentials,
            scopes: scopes, // Quyền đọc hoặc ghi
        });
        // Tạo đối tượng sheets mới mỗi lần
        const sheetsApi = google.sheets({ version: 'v4', auth: googleAuth });
        return sheetsApi;
    } catch (e) {
        console.error("Lỗi Khởi Tạo Google Sheets API (login local):", e);
        throw new Error("Không thể khởi tạo Google Sheets API.");
    }
}
// === KẾT THÚC BẢN VÁ ===

// --- Hàm xử lý chính ---
export default async function handler(request, response) {
    response.setHeader('Access-Control-Allow-Origin', '*'); // Cho phép CORS nếu cần
    response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (request.method === 'OPTIONS') {
        return response.status(200).end();
    }

    if (request.method !== 'POST') {
        return response.status(405).json({ error: 'Method Not Allowed' });
    }

    const { action, username, password, type } = request.body;

    // --- Phân luồng xử lý dựa trên "action" ---
    switch (action) {
        case 'register':
            return await handleRegister(request, response, username, password);
        case 'login':
            // Phân biệt login cho player và super_admin
            return await handleLogin(request, response, password, type); // Thêm username vào handleLogin nếu cần
        default:
            return response.status(400).json({ success: false, message: 'Hành động không hợp lệ.' });
    }
}

// --- Logic xử lý Đăng ký ---
async function handleRegister(request, response, username, password) {
    if (!username || !password) {
        return response.status(400).json({ success: false, message: 'Tên và mật khẩu không được để trống.' });
    }

    // Thêm kiểm tra ký tự hợp lệ cho username nếu cần
    if (/\s/.test(username)) {
         return response.status(400).json({ success: false, message: 'Tên người chơi không được chứa khoảng trắng.' });
    }

    try {
        const { spreadsheetId } = getGoogleSheetConfig();

        // === BẢN VÁ: Gọi helper mới ===
        const sheets = await getGoogleSheetsAPI_local_login(
            ['https://www.googleapis.com/auth/spreadsheets'] // Quyền ghi
        );
        // === KẾT THÚC BẢN VÁ ===

        // 1. Đọc dữ liệu để kiểm tra tên người dùng đã tồn tại chưa
        const readRes = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: 'Players!A:A', // Chỉ cần đọc cột Username
        });
        const existingUsers = readRes.data.values ? readRes.data.values.flat() : [];
        if (existingUsers.some(u => u && u.toLowerCase() === username.toLowerCase())) {
            return response.status(409).json({ success: false, message: 'Tên người chơi này đã tồn tại.' });
        }

        // 2. Nếu chưa tồn tại, ghi người dùng mới vào cuối sheet
        await sheets.spreadsheets.values.append({
            spreadsheetId,
            range: 'Players!A:B',
            valueInputOption: 'USER_ENTERED',
            insertDataOption: 'INSERT_ROWS', // Quan trọng: Thêm vào dòng mới
            requestBody: {
                values: [[username, password]],
            },
        });

        return response.status(201).json({ success: true, message: 'Đăng ký thành công!' });

    } catch (error) {
        console.error('Register API Error:', error);
        // Trả về lỗi chi tiết hơn nếu có thể
        const errorMessage = error.response?.data?.error?.message || error.message || 'Lỗi máy chủ khi đăng ký.';
        return response.status(500).json({ success: false, message: errorMessage });
    }
}

// --- Logic xử lý Đăng nhập ---
async function handleLogin(request, response, password, type) {
    if (!password) {
        return response.status(400).json({ success: false, message: 'Vui lòng nhập mật khẩu.' });
    }

    // Login cho Super Admin (dùng mật khẩu cứng hoặc biến môi trường)
    if (type === 'super_admin') {
        const superAdminPassword = process.env.SUPER_ADMIN_PASSWORD || 'your_secret_super_admin_password'; // Lấy từ env hoặc dùng mặc định yếu
        if (password === superAdminPassword) {
            // Có thể tạo một token tạm thời hoặc chỉ cần trả về success
            return response.status(200).json({ success: true, username: 'SuperAdmin', type: 'super_admin' });
        } else {
            return response.status(401).json({ success: false, message: 'Mật khẩu Super Admin không chính xác.' });
        }
    }

    // Login cho Player (đọc từ Google Sheet)
    if (type === 'player') {
        try {
            const { spreadsheetId } = getGoogleSheetConfig();

            // === BẢN VÁ: Gọi helper mới ===
            const sheets = await getGoogleSheetsAPI_local_login(
                ['https://www.googleapis.com/auth/spreadsheets.readonly'] // Chỉ quyền đọc
            );
            // === KẾT THÚC BẢN VÁ ===

            const res = await sheets.spreadsheets.values.get({
                spreadsheetId,
                range: 'Players!A:B', // Đọc cả Username và Password
            });

            const rows = res.data.values;
            if (!rows || rows.length <= 1) { // <= 1 vì có thể chỉ có hàng tiêu đề
                console.warn('No player data found in Players sheet or only header exists.');
                return response.status(401).json({ success: false, message: 'Mật khẩu không chính xác hoặc không tìm thấy người chơi.' });
            }

            // Bỏ qua hàng tiêu đề nếu có
            const players = rows.slice(1).map(row => ({ Username: row[0] || '', Password: row[1] || '' }));
            const foundPlayer = players.find(p => p.Password === password);

            if (foundPlayer) {
                return response.status(200).json({ success: true, username: foundPlayer.Username, type: 'player' });
            } else {
                return response.status(401).json({ success: false, message: 'Mật khẩu không chính xác.' });
            }
        } catch (error) {
            console.error('Player Login API Error:', error);
            const errorMessage = error.response?.data?.error?.message || error.message || 'Lỗi máy chủ khi đăng nhập.';
            return response.status(500).json({ success: false, message: errorMessage });
        }
    }

    // Trường hợp type không hợp lệ
    return response.status(400).json({ success: false, message: 'Loại đăng nhập không hợp lệ.' });
}