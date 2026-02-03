import { 
    auth, database, provider, signInWithPopup, signOut, onAuthStateChanged,
    ref, set, get, update, onValue, push, remove, onChildAdded, onChildChanged
} from './firebase-config.js';

// Глобальные переменные
let currentUser = null;
let gamesListener = null;

// Элементы DOM
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

// Роли
const ROLES = ['Капитан', 'Штурман', 'Инженер', 'Акустик', 'Оружейник', 'Связист'];

// Показать статус
function showStatus(message, type = 'info') {
    statusMessage.textContent = message;
    statusMessage.className = `status show`;
    setTimeout(() => {
        statusMessage.classList.remove('show');
    }, 3000);
}

// Генерация кода
function generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

// Обновить UI
function updateUIAfterLogin(user) {
    currentUser = user;
    userAvatar.src = user.photoURL || 'https://via.placeholder.com/50';
    userName.textContent = user.displayName || 'Пользователь';
    userEmail.textContent = user.email || '';
    userInfo.classList.remove('hidden');
    loginBtn.classList.add('hidden');
    mainContent.classList.remove('hidden');
    loadActiveGames();
}

// Авторизация
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
});

// Вход через Google
loginBtn.addEventListener('click', async () => {
    try {
        const result = await signInWithPopup(auth, provider);
        showStatus(`Добро пожаловать, ${result.user.displayName || 'Пользователь'}!`);
    } catch (error) {
        console.error('Login error:', error);
        showStatus('Ошибка входа');
    }
});

// Выход
logoutBtn.addEventListener('click', async () => {
    try {
        await signOut(auth);
        showStatus('Вы вышли из системы');
    } catch (error) {
        console.error('Logout error:', error);
        showStatus('Ошибка выхода');
    }
});

// Создание игры
createGameBtn.addEventListener('click', async () => {
    if (!currentUser) {
        showStatus('Сначала войдите в систему');
        return;
    }
    
    const subName = subNameInput.value.trim();
    if (!subName) {
        showStatus('Введите название подлодки');
        subNameInput.focus();
        return;
    }
    
    const roomCode = generateRoomCode();
    const gameRef = ref(database, `games/${roomCode}`);
    
    try {
        const newGame = {
            name: subName,
            code: roomCode,
            createdAt: Date.now(),
            captain: currentUser.uid,
            captainName: currentUser.displayName || 'Аноним',
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
                location: { x: 0, y: 0 },
                target: { x: 10, y: 10 },
                mission: 'Патрулирование',
                alerts: []
            }
        };
        
        await set(gameRef, newGame);
        showStatus(`Подлодка "${subName}" создана! Код: ${roomCode}`);
        
        localStorage.setItem('neocascade_room', roomCode);
        localStorage.setItem('neocascade_role', ROLES[0]);
        localStorage.setItem('neocascade_userId', currentUser.uid);
        setTimeout(() => {
            window.location.href = 'submarine.html';
        }, 1500);
        
    } catch (error) {
        console.error('Create game error:', error);
        showStatus('Ошибка создания игры');
    }
});

// Присоединение к игре
joinGameBtn.addEventListener('click', async () => {
    if (!currentUser) {
        showStatus('Сначала войдите в систему');
        return;
    }
    
    const roomCode = roomCodeInput.value.trim().toUpperCase();
    if (!roomCode || roomCode.length !== 6) {
        showStatus('Введите корректный код (6 символов)');
        roomCodeInput.focus();
        return;
    }
    
    const gameRef = ref(database, `games/${roomCode}`);
    
    try {
        const snapshot = await get(gameRef);
        if (!snapshot.exists()) {
            showStatus('Игра не найдена');
            return;
        }
        
        const game = snapshot.val();
        
        if (game.players && game.players[currentUser.uid]) {
            showStatus('Вы уже в этой игре');
            localStorage.setItem('neocascade_room', roomCode);
            localStorage.setItem('neocascade_role', game.players[currentUser.uid].role);
            localStorage.setItem('neocascade_userId', currentUser.uid);
            setTimeout(() => {
                window.location.href = 'submarine.html';
            }, 1000);
            return;
        }
        
        if (game.currentPlayers >= game.maxPlayers) {
            showStatus('Игра заполнена');
            return;
        }
        
        const playerCount = game.currentPlayers || 1;
        const roleIndex = Math.min(playerCount, ROLES.length - 1);
        const role = ROLES[roleIndex];
        
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
        showStatus(`Присоединились к "${game.name}" как ${role}`);
        
        localStorage.setItem('neocascade_room', roomCode);
        localStorage.setItem('neocascade_role', role);
        localStorage.setItem('neocascade_userId', currentUser.uid);
        setTimeout(() => {
            window.location.href = 'submarine.html';
        }, 1500);
        
    } catch (error) {
        console.error('Join error:', error);
        showStatus('Ошибка присоединения');
    }
});

// Загрузка игр
function loadActiveGames() {
    if (gamesListener) gamesListener();
    
    const gamesRef = ref(database, 'games');
    
    gamesListener = onValue(gamesRef, (snapshot) => {
        gamesList.innerHTML = '';
        
        if (!snapshot.exists()) {
            gamesList.innerHTML = '<p>Нет активных подлодок</p>';
            return;
        }
        
        const games = snapshot.val();
        const gamesArray = Object.entries(games)
            .filter(([_, game]) => game.status !== 'finished' && game.currentPlayers < game.maxPlayers)
            .sort((a, b) => b[1].createdAt - a[1].createdAt);
        
        if (gamesArray.length === 0) {
            gamesList.innerHTML = '<p>Нет активных подлодок</p>';
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
                    <span>Игроков: ${game.currentPlayers || 1}/${game.maxPlayers}</span>
                    <button class="join-btn btn secondary small" data-code="${code}">
                        <i class="fas fa-plug"></i> Присоединиться
                    </button>
                </div>
            `;
            
            gamesList.appendChild(gameCard);
        });
        
        // Обработчики для кнопок
        document.querySelectorAll('.join-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const code = e.target.closest('.join-btn').dataset.code;
                roomCodeInput.value = code;
                joinGameBtn.click();
            });
        });
        
    }, (error) => {
        console.error('Load games error:', error);
        gamesList.innerHTML = '<p>Ошибка загрузки</p>';
    });
}

// Enter для полей
subNameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') createGameBtn.click();
});

roomCodeInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') joinGameBtn.click();
});

// Автофокус
document.addEventListener('DOMContentLoaded', () => {
    if (!auth.currentUser) {
        setTimeout(() => subNameInput?.focus(), 300);
    }
});
