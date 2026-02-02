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
const userEmail = document.getElementById('user-email');
const mainContent = document.getElementById('main-content');
const createGameBtn = document.getElementById('create-game');
const joinGameBtn = document.getElementById('join-game');
const subNameInput = document.getElementById('sub-name');
const roomCodeInput = document.getElementById('room-code');
const gamesList = document.getElementById('games-list');
const statusMessage = document.getElementById('status-message');

// Роли для подлодки
const ROLES = [
    'Капитан',
    'Штурман', 
    'Инженер',
    'Акустик',
    'Оружейник',
    'Связист'
];

// Показать статус сообщение
function showStatus(message, type = 'info', duration = 3000) {
    statusMessage.innerHTML = '';
    
    const iconMap = {
        success: 'check-circle',
        error: 'exclamation-circle',
        warning: 'exclamation-triangle',
        info: 'info-circle'
    };
    
    const icon = iconMap[type] || 'info-circle';
    
    statusMessage.innerHTML = `
        <i class="fas fa-${icon}"></i>
        <span>${message}</span>
    `;
    
    statusMessage.className = `status show ${type}`;
    
    setTimeout(() => {
        statusMessage.classList.remove('show');
    }, duration);
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

// Обновить UI после входа
function updateUIAfterLogin(user) {
    currentUser = user;
    
    if (user.photoURL) {
        userAvatar.src = user.photoURL;
    } else {
        userAvatar.src = 'https://via.placeholder.com/50/0066cc/ffffff?text=' + user.displayName?.charAt(0) || 'U';
    }
    
    userName.textContent = user.displayName || 'Пользователь';
    userEmail.textContent = user.email || '';
    
    userInfo.classList.remove('hidden');
    loginBtn.classList.add('hidden');
    mainContent.classList.remove('hidden');
    
    loadActiveGames();
}

// Слушатель состояния аутентификации
onAuthStateChanged(auth, (user) => {
    if (user) {
        updateUIAfterLogin(user);
    } else {
        currentUser = null;
        userInfo.classList.add('hidden');
        loginBtn.classList.remove('hidden');
        mainContent.classList.add('hidden');
        gamesList.innerHTML = '<div class="loading"><div class="loading-dot"></div><div class="loading-dot"></div><div class="loading-dot"></div></div>';
    }
}, (error) => {
    console.error('Auth state error:', error);
    showStatus('Ошибка авторизации: ' + error.message, 'error');
});

// Вход через Google
loginBtn.addEventListener('click', async () => {
    try {
        const result = await signInWithPopup(auth, provider);
        const user = result.user;
        showStatus(`Добро пожаловать, ${user.displayName || 'Пользователь'}!`, 'success');
    } catch (error) {
        console.error('Ошибка входа:', error);
        
        let errorMessage = 'Ошибка входа';
        switch(error.code) {
            case 'auth/popup-blocked':
                errorMessage = 'Браузер заблокировал всплывающее окно. Разрешите всплывающие окна для этого сайта.';
                break;
            case 'auth/popup-closed-by-user':
                errorMessage = 'Вы закрыли окно входа. Попробуйте снова.';
                break;
            case 'auth/unauthorized-domain':
                errorMessage = 'Домен не авторизован. Добавьте ваш домен в Firebase Console в разделе Authentication → Settings → Authorized domains';
                break;
            default:
                errorMessage = error.message;
        }
        
        showStatus(errorMessage, 'error', 5000);
    }
});

// Выход
logoutBtn.addEventListener('click', async () => {
    try {
        await signOut(auth);
        showStatus('Вы вышли из системы', 'info');
    } catch (error) {
        console.error('Ошибка выхода:', error);
        showStatus('Ошибка выхода: ' + error.message, 'error');
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
        subNameInput.focus();
        return;
    }
    
    if (subName.length < 2) {
        showStatus('Название должно быть не менее 2 символов', 'error');
        return;
    }
    
    const roomCode = generateRoomCode();
    const gameRef = ref(database, `games/${roomCode}`);
    
    try {
        // Проверить, существует ли уже комната
        const snapshot = await get(gameRef);
        if (snapshot.exists()) {
            // Если код уже существует, генерируем новый
            createGameBtn.click();
            return;
        }
        
        // Создать новую игру
        const newGame = {
            name: subName,
            code: roomCode,
            createdAt: Date.now(),
            captain: currentUser.uid,
            captainName: currentUser.displayName || 'Аноним',
            captainAvatar: currentUser.photoURL || '',
            players: {
                [currentUser.uid]: {
                    name: currentUser.displayName || 'Аноним',
                    avatar: currentUser.photoURL || '',
                    role: ROLES[0],
                    joinedAt: Date.now(),
                    online: true
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
                target: { x: 10, y: 10 },
                mission: 'Патрулирование',
                alerts: []
            }
        };
        
        await set(gameRef, newGame);
        showStatus(`Подлодка "${subName}" создана! Код: ${roomCode}`, 'success');
        
        // Сохранить в localStorage и перейти
        localStorage.setItem('neocascade_room', roomCode);
        localStorage.setItem('neocascade_role', ROLES[0]);
        localStorage.setItem('neocascade_userId', currentUser.uid);
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
        roomCodeInput.focus();
        return;
    }
    
    const gameRef = ref(database, `games/${roomCode}`);
    
    try {
        const snapshot = await get(gameRef);
        if (!snapshot.exists()) {
            showStatus('Игра не найдена. Проверьте код комнаты.', 'error');
            return;
        }
        
        const game = snapshot.val();
        
        // Проверить, не присоединился ли уже
        if (game.players && game.players[currentUser.uid]) {
            showStatus('Вы уже в этой игре', 'warning');
            localStorage.setItem('neocascade_room', roomCode);
            localStorage.setItem('neocascade_role', game.players[currentUser.uid].role);
            localStorage.setItem('neocascade_userId', currentUser.uid);
            window.location.href = 'submarine.html';
            return;
        }
        
        // Проверить наличие мест
        if (game.currentPlayers >= game.maxPlayers) {
            showStatus('Игра заполнена. Максимум 6 игроков.', 'error');
            return;
        }
        
        // Определить роль
        const playerCount = game.currentPlayers || 1;
        const roleIndex = Math.min(playerCount, ROLES.length - 1);
        const role = ROLES[roleIndex] || `Экипаж ${playerCount + 1}`;
        
        // Обновить игру
        const updates = {};
        updates[`players/${currentUser.uid}`] = {
            name: currentUser.displayName || 'Аноним',
            avatar: currentUser.photoURL || '',
            role: role,
            joinedAt: Date.now(),
            online: true
        };
        updates['currentPlayers'] = playerCount + 1;
        updates['status'] = 'active';
        
        await update(gameRef, updates);
        showStatus(`Присоединились к "${game.name}" как ${role}`, 'success');
        
        // Сохранить и перейти
        localStorage.setItem('neocascade_room', roomCode);
        localStorage.setItem('neocascade_role', role);
        localStorage.setItem('neocascade_userId', currentUser.uid);
        window.location.href = 'submarine.html';
        
    } catch (error) {
        console.error('Ошибка присоединения:', error);
        showStatus('Ошибка присоединения: ' + error.message, 'error');
    }
});

// Загрузка активных игр
function loadActiveGames() {
    // Удалить предыдущий слушатель
    if (gamesListener) {
        gamesListener();
    }
    
    const gamesRef = ref(database, 'games');
    
    gamesListener = onValue(gamesRef, (snapshot) => {
        gamesList.innerHTML = '';
        
        if (!snapshot.exists()) {
            gamesList.innerHTML = `
                <div class="no-games">
                    <i class="fas fa-water"></i>
                    <p>Нет активных подлодок. Создайте первую!</p>
                </div>
            `;
            return;
        }
        
        const games = snapshot.val();
        const gamesArray = Object.entries(games)
            .filter(([_, game]) => game.status !== 'finished' && game.currentPlayers < game.maxPlayers)
            .sort((a, b) => b[1].createdAt - a[1].createdAt);
        
        if (gamesArray.length === 0) {
            gamesList.innerHTML = `
                <div class="no-games">
                    <i class="fas fa-water"></i>
                    <p>Нет активных подлодок. Создайте первую!</p>
                </div>
            `;
            return;
        }
        
        gamesArray.forEach(([code, game]) => {
            const gameCard = document.createElement('div');
            gameCard.className = 'game-card';
            gameCard.innerHTML = `
                <h3>${game.name}</h3>
                <div class="code">${code}</div>
                <p>Капитан: ${game.captainName}</p>
                <div class="game-info">
                    <div class="players-count">
                        <i class="fas fa-user"></i>
                        <span>${game.currentPlayers || 1}/${game.maxPlayers}</span>
                    </div>
                    <span>${new Date(game.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                </div>
                <button class="join-btn btn secondary" data-code="${code}">
                    <i class="fas fa-plug"></i> Присоединиться
                </button>
            `;
            
            gamesList.appendChild(gameCard);
        });
        
        // Обработчики для кнопок
        document.querySelectorAll('.join-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const code = btn.dataset.code;
                roomCodeInput.value = code;
                joinGameBtn.click();
            });
        });
        
        // Клик по карточке игры
        document.querySelectorAll('.game-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (!e.target.classList.contains('join-btn')) {
                    const code = card.querySelector('.join-btn').dataset.code;
                    roomCodeInput.value = code;
                    joinGameBtn.click();
                }
            });
        });
        
    }, (error) => {
        console.error('Ошибка загрузки игр:', error);
        gamesList.innerHTML = `
            <div class="no-games">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Ошибка загрузки игр. Проверьте подключение.</p>
            </div>
        `;
    });
}

// Очистка при закрытии
window.addEventListener('beforeunload', () => {
    if (gamesListener) {
        gamesListener();
    }
});

// Enter для полей ввода
subNameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        createGameBtn.click();
    }
});

roomCodeInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        joinGameBtn.click();
    }
});

// Автоматический фокус
document.addEventListener('DOMContentLoaded', () => {
    if (auth.currentUser) {
        // Уже авторизован
    } else {
        // Автофокус на поле ввода при загрузке
        setTimeout(() => {
            if (subNameInput) subNameInput.focus();
        }, 500);
    }
});
