const axios = require('axios');

const ZOOM_CONFIG = {
  clientId: process.env.ZOOM_CLIENT_ID,
  clientSecret: process.env.ZOOM_CLIENT_SECRET,
  accountId: process.env.ZOOM_ACCOUNT_ID,
};

// Глобальные переменные для кеширования токена
let cachedAccessToken = null;
let tokenExpiryTime = null;

//Получает access_token для Server-to-Server OAuth
async function getZoomAccessToken() {
  if (cachedAccessToken && tokenExpiryTime && Date.now() < tokenExpiryTime) {
    return cachedAccessToken;
  }

  try {
    const authData = new URLSearchParams();
    authData.append('grant_type', 'account_credentials');
    authData.append('account_id', ZOOM_CONFIG.accountId);

    const basicAuthToken = Buffer.from(`${ZOOM_CONFIG.clientId}:${ZOOM_CONFIG.clientSecret}`).toString('base64');

    const response = await axios.post('https://zoom.us/oauth/token', authData.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${basicAuthToken}`
      }
    });

    const { access_token, expires_in } = response.data;
    cachedAccessToken = access_token;
    tokenExpiryTime = Date.now() + (expires_in * 1000) - 60000; // Минус 60 секунд для надежности

    console.log('Токен успешно обновлен');
    return access_token;

  } catch (error) {
    console.error('Ошибка при получении токена:', error.response?.data || error.message);
    throw error;
  }
}

//Универсальная функция для вызова Zoom API
async function callZoomAPI(method, endpoint, params = {}) {
  try {
    const accessToken = await getZoomAccessToken();
    const url = `https://api.zoom.us${endpoint}`;

    const config = {
      method,
      url,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      params: method === 'GET' ? params : {} // Параметры запроса для GET
    };

    const response = await axios(config);
    return response.data;

  } catch (error) {
    console.error(`Ошибка API: ${endpoint}`, error.response?.data || error.message);
    throw error;
  }
}

//Получает список всех пользователей аккаунта
async function getAllUsers() {
  try {
    console.log('Получаем список пользователей...');
    let allUsers = [];
    let nextPageToken = null;

    do {
      const params = { status: 'active', page_size: 300 };
      if (nextPageToken) params.next_page_token = nextPageToken;

      const response = await callZoomAPI('GET', '/v2/users', params);
      allUsers = allUsers.concat(response.users);
      nextPageToken = response.next_page_token || null;

    } while (nextPageToken);

    console.log(`Найдено пользователей: ${allUsers.length}`);
    return allUsers;

  } catch (error) {
    console.error('Ошибка при получении списка пользователей:', error);
    return [];
  }
}

//Получает все записи для конкретного пользователя
async function getRecordingsForUser(userId, userEmail, fromDate = '2024-01-01', toDate = new Date().toISOString().split('T')[0]) {
  try {
    let allRecordings = [];
    let nextPageToken = null;

    do {
      const params = {
        from: fromDate,
        to: toDate,
        page_size: 300
      };
      if (nextPageToken) params.next_page_token = nextPageToken;

      const response = await callZoomAPI('GET', `/v2/users/${userId}/recordings`, params);

      // Добавляем информацию о пользователе к каждой записи
      if (response.meetings) {
        const recordingsWithUser = response.meetings.map(meeting => ({
          ...meeting,
          host_email: userEmail,
          host_id: userId
        }));
        allRecordings = allRecordings.concat(recordingsWithUser);
      }

      nextPageToken = response.next_page_token || null;

    } while (nextPageToken);

    console.log(`Для пользователя ${userEmail} найдено записей: ${allRecordings.length}`);
    return allRecordings;

  } catch (error) {
    // Если у пользователя нет прав на записи, пропускаем
    if (error.response?.status === 404) {
      console.log(`Пользователь ${userEmail} не имеет записей или не имеет прав`);
      return [];
    }
    console.error(`Ошибка при получении записей для ${userEmail}:`, error.response?.data || error.message);
    return [];
  }
}

//Получает ВСЕ записи ВСЕХ пользователей
async function getAllRecordings(fromDate = '2024-01-01') {
  try {
    const users = await getAllUsers();
    const allRecordings = [];

    console.log('\nНачинаем сбор записей по пользователям...');

    // Обрабатываем пользователей последовательно для избежания rate limits
    for (const user of users) {
      const userRecordings = await getRecordingsForUser(user.id, user.email, fromDate);
      allRecordings.push(...userRecordings);

      // Небольшая пауза между запросами к разным пользователям
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    console.log(`\nВСЕГО найдено записей: ${allRecordings.length}`);
    return allRecordings;

  } catch (error) {
    console.error('Ошибка при получении всех записей:', error);
    return [];
  }
}

//Удаляет конкретную запись
async function deleteRecording(meetingId, recordingId) {
  try {
    console.log(`Пытаюсь удалить запись ${recordingId} встречи ${meetingId}...`);
    await callZoomAPI('DELETE', `/v2/meetings/${meetingId}/recordings/${recordingId}`);
    console.log(`✅ Запись ${recordingId} успешно удалена`);
    return true;

  } catch (error) {
    console.error(`❌ Ошибка удаления записи ${recordingId}:`, error.response?.data || error.message);
    return false;
  }
}

//Удаляет ВСЕ записи конкретной встречи
async function deleteAllMeetingRecordings(meetingId) {
  try {
    console.log(`\nУдаляем ВСЕ записи встречи ${meetingId}...`);
    await callZoomAPI('DELETE', `/v2/meetings/${meetingId}/recordings?action=trash`);
    console.log(`✅ Все записи встречи ${meetingId} отправлены в корзину`);
    return true;

  } catch (error) {
    console.error(`❌ Ошибка удаления записей встречи ${meetingId}:`, error.response?.data || error.message);
    return false;
  }
}

module.exports = {
  getAllRecordings,
  deleteRecording,
  deleteAllMeetingRecordings
};