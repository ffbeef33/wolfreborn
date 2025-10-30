// File: /api/sheets.js
import { google } from 'googleapis';

// --- Hàm helper để lấy thông tin xác thực và ID sheet từ biến môi trường ---
function getGoogleSheetConfig() {
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

// --- Hàm xử lý chính ---
export default async function handler(request, response) {
    response.setHeader('Access-Control-Allow-Origin', '*'); // Cho phép CORS nếu cần
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (request.method === 'OPTIONS') {
        return response.status(200).end();
    }

    // ========================================================
    // === XỬ LÝ YÊU CẦU GET (ĐỌC DỮ LIỆU) ===
    // ========================================================
    if (request.method === 'GET') {
        try {
            const { credentials, spreadsheetId } = getGoogleSheetConfig();
            const auth = new google.auth.GoogleAuth({
                credentials,
                scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'], // Chỉ cần quyền đọc cho GET
            });
            const sheets = google.sheets({ version: 'v4', auth });

            // Lấy sheetName từ query, mặc định là 'Roles' nếu không có
            const { sheetName = 'Roles' } = request.query;

            // Danh sách các sheet được phép đọc
            const allowedSheets = ['Roles', 'Players', 'Favor Deck', 'Quotes', 'Question', 'Mechanic', 'GameLog'];

            if (!allowedSheets.includes(sheetName)) {
                return response.status(400).json({ error: 'Invalid sheet name specified.' });
            }

            const res = await sheets.spreadsheets.values.get({
                spreadsheetId,
                range: sheetName, // Đọc toàn bộ sheet được yêu cầu
            });

            const rows = res.data.values;
            if (!rows || rows.length === 0) {
                // Trả về mảng rỗng thay vì lỗi 404 để client xử lý dễ hơn
                console.warn(`No data found in ${sheetName} sheet.`);
                return response.status(200).json([]);
            }

            // Thiết lập cache control
            response.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate'); // Cache 10s

            // Xử lý định dạng dữ liệu trả về tùy theo sheetName
            if (sheetName === 'Quotes' || sheetName === 'Question') {
                // Giả sử dữ liệu nằm ở cột đầu tiên
                const items = rows.map(row => row[0]).filter(Boolean); // Lấy cột A và loại bỏ dòng trống
                return response.status(200).json(items);
            }

            if (sheetName === 'Favor Deck') {
                // Logic xử lý Favor Deck (giữ nguyên từ file cũ của bạn)
                const decks = [];
                const deckNames = rows[0] || [];
                const playerCounts = rows[2] || []; // Giả sử dòng 3 là player count

                for (let col = 1; col < deckNames.length; col++) { // Bắt đầu từ cột B
                    const deckName = deckNames[col];
                    if (!deckName) continue;

                    const deck = {
                        deckName: deckName.trim(),
                        playerCount: parseInt(playerCounts[col]) || 0,
                        roles: [],
                    };

                    for (let row = 3; row < rows.length; row++) { // Giả sử vai trò bắt đầu từ dòng 4
                        if (rows[row] && rows[row][col]) {
                            deck.roles.push(rows[row][col].trim());
                        }
                    }
                    decks.push(deck);
                }
                return response.status(200).json(decks);
            }

             if (sheetName === 'Mechanic') {
                // Logic xử lý sheet Mechanic (cột A là tên phase, cột B là thời gian)
                const mechanicData = {};
                // Bỏ qua hàng tiêu đề (hàng 1)
                for (let i = 1; i < rows.length; i++) {
                    const row = rows[i];
                    if (row && row[0] && row[1]) {
                        const phaseName = row[0].toUpperCase(); // Ví dụ: 'NGÀY', 'ĐÊM', 'BIỂU QUYẾT'
                        const timeInSeconds = parseInt(row[1]);
                        if (!isNaN(timeInSeconds)) {
                            mechanicData[phaseName] = timeInSeconds;
                        }
                    }
                }
                 return response.status(200).json(mechanicData); // Trả về dạng object { 'NGÀY': 120, ... }
             }


            // Mặc định: Xử lý sheet có hàng tiêu đề (Roles, Players, GameLog)
            const headers = rows[0].map(header => header.trim()); // Lấy hàng tiêu đề
            const data = rows.slice(1).map(row => { // Bỏ qua hàng tiêu đề
                let obj = {};
                headers.forEach((header, index) => {
                    // Xử lý giá trị rỗng/undefined thành chuỗi rỗng
                    obj[header] = (row && row[index] !== undefined && row[index] !== null) ? String(row[index]) : '';
                });
                return obj;
            });

            return response.status(200).json(data);

        } catch (error) {
            console.error('GET API Error:', error);
            const errorMessage = error.response?.data?.error?.message || error.message || 'Failed to fetch data from Google Sheets.';
            return response.status(500).json({ error: errorMessage });
        }
    }

    // ========================================================
    // === XỬ LÝ YÊU CẦU POST (GHI/XÓA DỮ LIỆU LOG) ===
    // ========================================================
    if (request.method === 'POST') {
        try {
            const { credentials, spreadsheetId } = getGoogleSheetConfig();
             const auth = new google.auth.GoogleAuth({
                 credentials,
                 scopes: ['https://www.googleapis.com/auth/spreadsheets'], // Cần quyền ghi cho POST
             });
             const sheets = google.sheets({ version: 'v4', auth });

            const { action, payload } = request.body;
            const gameLogSheetName = 'GameLog'; // Tên sheet log

            if (action === 'saveGameLog') {
                if (!payload || !Array.isArray(payload) || payload.length === 0) {
                    return response.status(400).json({ error: 'Invalid payload for saveGameLog.' });
                }

                // Chuyển đổi payload thành dạng [[role, name], [role, name], ...]
                const values = payload.map(item => [(item.role || ''), (item.name || '')]);

                // Xóa dữ liệu cũ trước khi ghi mới
                await sheets.spreadsheets.values.clear({
                    spreadsheetId,
                    range: `${gameLogSheetName}!A2:B`, // Xóa từ hàng 2 trở đi
                });

                // Ghi dữ liệu mới vào
                await sheets.spreadsheets.values.append({
                    spreadsheetId,
                    range: `${gameLogSheetName}!A2`, // Bắt đầu ghi từ A2
                    valueInputOption: 'USER_ENTERED',
                    insertDataOption: 'INSERT_ROWS',
                    requestBody: {
                        values,
                    },
                });

                return response.status(200).json({ success: true, message: 'Game log saved successfully.' });
            }

            if (action === 'clearGameLog') {
                // Chỉ xóa dữ liệu log, không xóa tiêu đề
                await sheets.spreadsheets.values.clear({
                    spreadsheetId,
                    range: `${gameLogSheetName}!A2:B`, // Xóa từ hàng 2 trở đi
                });

                return response.status(200).json({ success: true, message: 'Game log cleared successfully.' });
            }

            // Hành động POST không hợp lệ
            return response.status(400).json({ error: 'Invalid action specified for POST request.' });

        } catch (error) {
            console.error('POST API Error:', error);
            const errorMessage = error.response?.data?.error?.message || error.message || 'Failed to process POST request.';
            return response.status(500).json({ error: errorMessage });
        }
    }

    // Phương thức không được hỗ trợ
    return response.status(405).json({ error: `Method ${request.method} Not Allowed` });
}