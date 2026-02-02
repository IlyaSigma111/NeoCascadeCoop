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
const ROLES = ['Капитан', 'Штурман', 'Инженер', 'Акустик', 'Оружейник', 'Связист'];

// Показать статус
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
        const initial = user.displayName?.charAt(0) || 'U';
        userAvatar.src = `https://ui-avatars.com/api/?name=${initial}&background=0066cc&color=fff&size=100`;
    }
    
    userName.textContent = user.displayName || 'Пользователь';
    userEmail.textContent = user.email || '';
    
    userInfo.classList.remove('hidden');
    loginBtn.classList.add('hidden');
    mainContent.classList.remove('hidden');
    
    loadActiveGames();
}

// Слушатель авторизации
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
    console.error('Auth error:', error);
    showStatus('Ошибка авторизации', 'error');
});

// Вход через Google
loginBtn.addEventListener('click', async () => {
    try {
        loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Загрузка...';
        loginBtn.disabled = true;
        
        const result = await signInWithPopup(auth, provider);
        const user = result.user;
        showStatus(`Добро пожаловать, ${user.displayName || 'Пользователь'}!`, 'success');
    } catch (error) {
        console.error('Login error:', error);
        
        let errorMessage = 'Ошибка входа';
        switch(error.code) {
            case 'auth/popup-blocked':
                errorMessage = 'Браузер заблокировал всплывающее окно. Разрешите всплывающие окна для этого сайта.';
                break;
            case 'auth/popup-closed-by-user':
                errorMessage = 'Вы закрыли окно входа. Попробуйте снова.';
                break;
            case 'auth/unauthorized-domain':
                errorMessage = 'Домен не авторизован. Добавьте ваш домен в Firebase Console.';
                break;
            default:
                errorMessage = error.message;
        }
        
        showStatus(errorMessage, 'error', 5000);
    } finally {
        loginBtn.innerHTML = '<i class="fab fa-google"></i> Войти через Google';
        loginBtn.disabled = false;
    }
});

// Выход
logoutBtn.addEventListener('click', async () => {
    try {
        await signOut(auth);
        showStatus('Вы вышли из системы', 'info');
    } catch (error) {
        console.error('Logout error:', error);
        showStatus('Ошибка выхода', 'error');
    }
});

// Создание игры
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
    
    createGameBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Создание...';
    createGameBtn.disabled = true;
    
    const roomCode = generateRoomCode();
    const gameRef = ref(database, `games/${roomCode}`);
    
    try {
        const snapshot = await get(gameRef);
        if (snapshot.exists()) {
            createGameBtn.click();
            return;
        }
        
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
                systems: { engines: 100, sonar: 100, weapons: 100, comms: 100, lifeSupport: 100 },
                location: { x: 0, y: 0 },
                target: { x: 10, y: 10 },
                mission: 'Патрулирование',
                alerts: []
            }
        };
        
        await set(gameRef, newGame);
        showStatus(`Подлодка "${subName}" создана! Код: ${roomCode}`, 'success');
        
        localStorage.setItem('neocascade_room', roomCode);
        localStorage.setItem('neocascade_role', ROLES[0]);
        localStorage.setItem('neocascade_userId', currentUser.uid);
        setTimeout(() => {
            window.location.href = 'submarine.html';
        }, 1500);
        
    } catch (error) {
        console.error('Create game error:', error);
        showStatus('Ошибка создания игры', 'error');
    } finally {
        createGameBtn.innerHTML = '<i class="fas fa-submarine"></i> Создать лодку';
        createGameBtn.disabled = false;
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
        showStatus('Введите корректный код (6 символов)', 'error');
        roomCodeInput.focus();
        return;
    }
    
    joinGameBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Подключение...';
    joinGameBtn.disabled = true;
    
    const gameRef = ref(database, `games/${roomCode}`);
    
    try {
        const snapshot = await get(gameRef);
        if (!snapshot.exists()) {
            showStatus('Игра не найдена', 'error');
            return;
        }
        
        const game = snapshot.val();
        
        if (game.players && game.players[currentUser.uid]) {
            showStatus('Вы уже в этой игре', 'warning');
            localStorage.setItem('neocascade_room', roomCode);
            localStorage.setItem('neocascade_role', game.players[currentUser.uid].role);
            localStorage.setItem('neocascade_userId', currentUser.uid);
            setTimeout(() => {
                window.location.href = 'submarine.html';
            }, 1000);
            return;
        }
        
        if (game.currentPlayers >= game.maxPlayers) {
            showStatus('Игра заполнена', 'error');
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
        showStatus(`Присоединились к "${game.name}" как ${role}`, 'success');
        
        localStorage.setItem('neocascade_room', roomCode);
        localStorage.setItem('neocascade_role', role);
        localStorage.setItem('neocascade_userId', currentUser.uid);
        setTimeout(() => {
            window.location.href = 'submarine.html';
        }, 1500);
        
    } catch (error) {
        console.error('Join error:', error);
        showStatus('Ошибка присоединения', 'error');
    } finally {
        joinGameBtn.innerHTML = '<i class="fas fa-plug"></i> Присоединиться';
        joinGameBtn.disabled = false;
    }
});

// Загрузка игр
function loadActiveGames() {
    if (gamesListener) gamesListener();
    
    const gamesRef = ref(database, 'games');
    
    gamesListener = onValue(gamesRef, (snapshot) => {
        gamesList.innerHTML = '';
        
        if (!snapshot.exists()) {
            gamesList.innerHTML = `
                <div class="no-games">
                    <i class="fas fa-water"></i>
                    <p>Нет активных подлодок</p>
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
                    <p>Нет активных подлодок</p>
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
        
        document.querySelectorAll('.join-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const code = btn.dataset.code;
                roomCodeInput.value = code;
                joinGameBtn.click();
            });
        });
        
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
        console.error('Load games error:', error);
        gamesList.innerHTML = `
            <div class="no-games">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Ошибка загрузки</p>
            </div>
        `;
    });
}

// Очистка
window.addEventListener('beforeunload', () => {
    if (gamesListener) gamesListener();
});

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
    
    // Pull to refresh для мобилок
    let startY = 0;
    document.addEventListener('touchstart', (e) => {
        startY = e.touches[0].pageY;
    }, { passive: true });
    
    document.addEventListener('touchmove', (e) => {
        const currentY = e.touches[0].pageY;
        const diff = currentY - startY;
        
        if (diff > 100 && window.scrollY <= 0) {
            loadActiveGames();
            showStatus('Список обновлён', 'success');
        }
    }, { passive: true });
});
