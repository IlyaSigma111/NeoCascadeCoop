import { 
    auth, database, provider, signInWithPopup, signOut, onAuthStateChanged,
    ref, set, get, update, onValue, push, remove, onChildAdded, onChildChanged
} from './firebase-config.js';

// Глобальные переменные
let currentUser = null;
let currentGameRef = null;
let gamesListener = null;

// Элементы DOM
const authSection = document.getElementById('auth-section');
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const userInfo = document.getElementById('user-info');
const userAvatar = document.getElementById('user-avatar');
const userName = document.getElementById('user-name');
const mainContent = document.getElementById('main-content');
const createGameBtn = document.getElementById('create-game');
const joinGameBtn = document.getElementById('join-game');
const subNameInput = document.getElementById('sub-name');
const roomCodeInput = document.getElementById('room-code');
const gamesList = document.getElementById('games-list');
const statusMessage = document.getElementById('status-message');

// Роли для подлодки (по количеству игроков)
const ROLES = [
    'Капитан',       // 1 игрок - управление, общее принятие решений
    'Штурман',       // 2 игрока - навигация, карта
    'Инженер',       // 3 игрока - системы, ремонт
    'Акустик',       // 4 игрока - гидролокатор, обнаружение
    'Оружейник',     // 5 игроков - вооружение, торпеды
    'Связист'        // 6 игроков - связь, переговоры
];

// Показать статус сообщение
function showStatus(message, type = 'info') {
    statusMessage.textContent = message;
    statusMessage.className = `status show ${type}`;
    setTimeout(() => {
        statusMessage.classList.remove('show');
    }, 3000);
}

// Генерация кода комнаты
function generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

// Слушатель состояния аутентификации
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        userAvatar.src = user.photoURL;
        userName.textContent = user.displayName;
        userInfo.classList.remove('hidden');
        loginBtn.classList.add('hidden');
        mainContent.classList.remove('hidden');
        
        // Загрузить активные игры
        loadActiveGames();
    } else {
        currentUser = null;
        userInfo.classList.add('hidden');
        loginBtn.classList.remove('hidden');
        mainContent.classList.add('hidden');
    }
});

// Вход через Google
loginBtn.addEventListener('click', async () => {
    try {
        await signInWithPopup(auth, provider);
        showStatus('Успешный вход!', 'success');
    } catch (error) {
        console.error('Ошибка входа:', error);
        showStatus('Ошибка входа: ' + error.message, 'error');
    }
});

// Выход
logoutBtn.addEventListener('click', async () => {
    try {
        await signOut(auth);
        showStatus('Вы вышли из системы', 'info');
    } catch (error) {
        console.error('Ошибка выхода:', error);
    }
});

// Создание новой игры
createGameBtn.addEventListener('click', async () => {
    if (!currentUser) {
        showStatus('Сначала войдите в систему', 'error');
        return;
    }
    
    const subName = subNameInput.value.trim();
    if (!subName) {
        showStatus('Введите название подлодки', 'error');
        return;
    }
    
    const roomCode = generateRoomCode();
    const gameRef = ref(database, `games/${roomCode}`);
    
    try {
        // Проверить, существует ли уже комната с таким кодом
        const snapshot = await get(gameRef);
        if (snapshot.exists()) {
            showStatus('Ошибка: комната уже существует', 'error');
            return;
        }
        
        // Создать новую игру
        const newGame = {
            name: subName,
            code: roomCode,
            createdAt: Date.now(),
            captain: currentUser.uid,
            captainName: currentUser.displayName,
            captainAvatar: currentUser.photoURL,
            players: {
                [currentUser.uid]: {
                    name: currentUser.displayName,
                    avatar: currentUser.photoURL,
                    role: ROLES[0], // Капитан для создателя
                    joinedAt: Date.now()
                }
            },
            status: 'waiting',
            maxPlayers: 6,
            currentPlayers: 1,
            submarine: {
                depth: 0,
                speed: 0,
                oxygen: 100,
                power: 100,
                hull: 100,
                systems: {
                    engines: 100,
                    sonar: 100,
                    weapons: 100,
                    comms: 100,
                    lifeSupport: 100
                },
                location: { x: 0, y: 0 },
                target: { x: 0, y: 0 },
                mission: 'Патрулирование',
                alerts: []
            }
        };
        
        await set(gameRef, newGame);
        showStatus(`Подлодка "${subName}" создана! Код: ${roomCode}`, 'success');
        
        // Сохранить код в localStorage и перейти к игре
        localStorage.setItem('neocascade_room', roomCode);
        localStorage.setItem('neocascade_role', ROLES[0]);
        window.location.href = 'submarine.html';
        
    } catch (error) {
        console.error('Ошибка создания игры:', error);
        showStatus('Ошибка создания игры: ' + error.message, 'error');
    }
});

// Присоединение к игре
joinGameBtn.addEventListener('click', async () => {
    if (!currentUser) {
        showStatus('Сначала войдите в систему', 'error');
        return;
    }
    
    const roomCode = roomCodeInput.value.trim().toUpperCase();
    if (!roomCode || roomCode.length !== 6) {
        showStatus('Введите корректный код комнаты (6 символов)', 'error');
        return;
    }
    
    const gameRef = ref(database, `games/${roomCode}`);
    
    try {
        const snapshot = await get(gameRef);
        if (!snapshot.exists()) {
            showStatus('Игра не найдена', 'error');
            return;
        }
        
        const game = snapshot.val();
        
        // Проверить, не присоединился ли уже игрок
        if (game.players && game.players[currentUser.uid]) {
            showStatus('Вы уже в этой игре', 'warning');
            // Перейти к игре
            localStorage.setItem('neocascade_room', roomCode);
            localStorage.setItem('neocascade_role', game.players[currentUser.uid].role);
            window.location.href = 'submarine.html';
            return;
        }
        
        // Проверить, есть ли свободные места
        if (game.currentPlayers >= game.maxPlayers) {
            showStatus('Игра заполнена', 'error');
            return;
        }
        
        // Определить роль (по количеству игроков)
        const playerCount = game.currentPlayers || 1;
        const role = ROLES[playerCount] || `Экипаж ${playerCount + 1}`;
        
        // Обновить игру
        const updates = {};
        updates[`players/${currentUser.uid}`] = {
            name: currentUser.displayName,
            avatar: currentUser.photoURL,
            role: role,
            joinedAt: Date.now()
        };
        updates['currentPlayers'] = playerCount + 1;
        updates['status'] = 'active';
        
        await update(gameRef, updates);
        showStatus(`Присоединились к подлодке "${game.name}" как ${role}`, 'success');
        
        // Сохранить данные и перейти к игре
        localStorage.setItem('neocascade_room', roomCode);
        localStorage.setItem('neocascade_role', role);
        window.location.href = 'submarine.html';
        
    } catch (error) {
        console.error('Ошибка присоединения:', error);
        showStatus('Ошибка присоединения: ' + error.message, 'error');
    }
});

// Загрузка активных игр
function loadActiveGames() {
    // Удалить предыдущий слушатель, если есть
    if (gamesListener) {
        gamesListener();
    }
    
    const gamesRef = ref(database, 'games');
    
    gamesListener = onValue(gamesRef, (snapshot) => {
        gamesList.innerHTML = '';
        
        if (!snapshot.exists()) {
            gamesList.innerHTML = '<p class="no-games">Нет активных подлодок</p>';
            return;
        }
        
        const games = snapshot.val();
        const gamesArray = Object.entries(games)
            .filter(([_, game]) => game.status !== 'finished' && game.currentPlayers < game.maxPlayers)
            .sort((a, b) => b[1].createdAt - a[1].createdAt);
        
        if (gamesArray.length === 0) {
            gamesList.innerHTML = '<p class="no-games">Нет активных подлодок</p>';
            return;
        }
        
        gamesArray.forEach(([code, game]) => {
            const gameCard = document.createElement('div');
            gameCard.className = 'game-card';
            gameCard.innerHTML = `
                <h3>${game.name}</h3>
                <p>Код: <strong>${code}</strong></p>
                <p>Игроков: ${game.currentPlayers || 1}/${game.maxPlayers}</p>
                <div class="info">
                    <span>Капитан: ${game.captainName}</span>
                    <button class="join-btn btn secondary" data-code="${code}">Присоединиться</button>
                </div>
            `;
            
            gamesList.appendChild(gameCard);
        });
        
        // Добавить обработчики для кнопок присоединения
        document.querySelectorAll('.join-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const code = btn.dataset.code;
                roomCodeInput.value = code;
                joinGameBtn.click();
            });
        });
    }, (error) => {
        console.error('Ошибка загрузки игр:', error);
    });
}

// Загрузка страницы
document.addEventListener('DOMContentLoaded', () => {
    // Автоматический вход, если уже авторизован
    if (auth.currentUser) {
        loginBtn.click();
    }
    
    // Очистка слушателя при закрытии страницы
    window.addEventListener('beforeunload', () => {
        if (gamesListener) {
            gamesListener();
        }
    });
});
