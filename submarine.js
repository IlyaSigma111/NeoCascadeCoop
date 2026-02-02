import { 
    auth, database, ref, onValue, update, remove, onChildAdded, onChildChanged, onChildRemoved,
    set, get, push, serverTimestamp
} from './firebase-config.js';

// Глобальные переменные
let currentUser = null;
let currentRoom = null;
let currentRole = null;
let userId = null;
let gameRef = null;
let playersListener = null;
let submarineListener = null;
let chatListener = null;
let gameLoop = null;

// Элементы DOM
const subNameElement = document.getElementById('sub-name');
const missionText = document.getElementById('mission-text');
const depthElement = document.getElementById('depth');
const speedElement = document.getElementById('speed');
const oxygenBar = document.getElementById('oxygen-bar');
const oxygenValue = document.getElementById('oxygen-value');
const powerBar = document.getElementById('power-bar');
const powerValue = document.getElementById('power-value');
const hullBar = document.getElementById('hull-bar');
const hullValue = document.getElementById('hull-value');
const posCoords = document.getElementById('pos-coords');
const targetCoords = document.getElementById('target-coords');
const roleTitle = document.getElementById('role-title');
const currentRoleBadge = document.getElementById('current-role');
const roleControls = document.getElementById('role-controls');
const playersList = document.getElementById('players-list');
const playersCount = document.getElementById('players-count');
const alertsList = document.getElementById('alerts-list');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const sendChatBtn = document.getElementById('send-chat');
const leaveBtn = document.getElementById('leave-game');
const mapCanvas = document.getElementById('map-canvas');

// Инициализация
async function init() {
    currentRoom = localStorage.getItem('neocascade_room');
    currentRole = localStorage.getItem('neocascade_role');
    userId = localStorage.getItem('neocascade_userId');
    
    if (!currentRoom || !currentRole || !userId) {
        alert('Ошибка: данные игры не найдены');
        window.location.href = 'index.html';
        return;
    }
    
    // Проверить аутентификацию
    auth.onAuthStateChanged((user) => {
        if (user) {
            currentUser = user;
            
            // Проверить, совпадает ли пользователь
            if (user.uid !== userId) {
                alert('Несоответствие пользователя. Пожалуйста, войдите снова.');
                window.location.href = 'index.html';
                return;
            }
            
            loadGame();
            setupChat();
            startGameLoop();
        } else {
            window.location.href = 'index.html';
        }
    }, (error) => {
        console.error('Auth error:', error);
        alert('Ошибка авторизации');
        window.location.href = 'index.html';
    });
}

// Загрузка игры
function loadGame() {
    gameRef = ref(database, `games/${currentRoom}`);
    
    // Слушатель данных подлодки
    submarineListener = onValue(gameRef, (snapshot) => {
        if (!snapshot.exists()) {
            alert('Игра не найдена или была удалена!');
            window.location.href = 'index.html';
            return;
        }
        
        const game = snapshot.val();
        updateGameDisplay(game);
        updateControls(game);
    }, (error) => {
        console.error('Game load error:', error);
        showAlert('Ошибка загрузки игры', 'error');
    });
    
    // Слушатель списка игроков
    const playersRef = ref(database, `games/${currentRoom}/players`);
    playersListener = onValue(playersRef, (snapshot) => {
        updatePlayersList(snapshot.val());
    });
    
    // Слушатель изменений игроков
    onChildChanged(playersRef, (snapshot) => {
        const player = snapshot.val();
        if (player.name) {
            showAlert(`${player.name} изменил роль на ${player.role}`);
        }
    });
    
    // Слушатель новых игроков
    onChildAdded(playersRef, (snapshot) => {
        const player = snapshot.val();
        if (snapshot.key !== userId && player.name) {
            showAlert(`${player.name} присоединился как ${player.role}`, 'success');
        }
    });
    
    // Слушатель ушедших игроков
    onChildRemoved(playersRef, (snapshot) => {
        const player = snapshot.val();
        if (player && player.name && snapshot.key !== userId) {
            showAlert(`${player.name} покинул подлодку`, 'warning');
        }
    });
}

// Настройка чата
function setupChat() {
    const chatRef = ref(database, `games/${currentRoom}/chat`);
    
    // Очистить старый слушатель
    if (chatListener) {
        chatListener();
    }
    
    // Загрузить последние сообщения
    chatListener = onValue(chatRef, (snapshot) => {
        chatMessages.innerHTML = '';
        
        if (!snapshot.exists()) return;
        
        const messages = snapshot.val();
        const messagesArray = Object.values(messages || {}).sort((a, b) => a.timestamp - b.timestamp);
        
        messagesArray.forEach(msg => {
            addChatMessage(msg);
        });
        
        // Автопрокрутка вниз
        setTimeout(() => {
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }, 100);
    });
    
    // Отправка сообщений
    sendChatBtn.addEventListener('click', sendMessage);
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });
}

// Отправить сообщение
function sendMessage() {
    const text = chatInput.value.trim();
    if (!text || !currentUser) return;
    
    const chatRef = ref(database, `games/${currentRoom}/chat`);
    const newMessageRef = push(chatRef);
    
    const message = {
        text: text,
        sender: currentUser.displayName || 'Аноним',
        senderId: currentUser.uid,
        role: currentRole,
        timestamp: Date.now()
    };
    
    set(newMessageRef, message)
        .then(() => {
            chatInput.value = '';
            chatInput.focus();
        })
        .catch(error => {
            console.error('Chat error:', error);
            showAlert('Ошибка отправки сообщения', 'error');
        });
}

// Добавить сообщение в чат
function addChatMessage(msg) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'chat-message';
    
    const time = new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    const isOwn = msg.senderId === currentUser?.uid;
    
    messageDiv.innerHTML = `
        <span class="sender" style="color: ${isOwn ? '#00a8ff' : '#2ecc71'}">${msg.sender}</span>
        <span class="role">(${msg.role})</span>
        <span class="time">${time}</span>
        <span class="text">${msg.text}</span>
    `;
    
    chatMessages.appendChild(messageDiv);
}

// Обновление отображения игры
function updateGameDisplay(game) {
    subNameElement.textContent = game.name || 'Без названия';
    missionText.textContent = game.submarine?.mission || 'Патрулирование';
    
    const depth = Math.abs(game.submarine?.depth || 0);
    const speed = game.submarine?.speed || 0;
    
    depthElement.textContent = depth;
    speedElement.textContent = speed;
    
    // Обновить системы
    updateSystemDisplay('oxygen', game.submarine?.oxygen || 100);
    updateSystemDisplay('power', game.submarine?.power || 100);
    updateSystemDisplay('hull', game.submarine?.hull || 100);
    
    // Обновить координаты
    const loc = game.submarine?.location || {x: 0, y: 0};
    const target = game.submarine?.target || {x: 10, y: 10};
    
    posCoords.textContent = `X:${loc.x.toFixed(1)}, Y:${loc.y.toFixed(1)}`;
    targetCoords.textContent = `X:${target.x}, Y:${target.y}`;
    
    // Обновить карту
    updateMap(loc, target);
    
    // Обновить роль
    currentRoleBadge.textContent = currentRole;
    roleTitle.textContent = `Ваша роль: ${currentRole}`;
    
    // Показать сигналы тревоги
    if (game.submarine?.alerts) {
        updateAlerts(game.submarine.alerts);
    }
}

// Обновить отображение системы
function updateSystemDisplay(system, value) {
    const bar = document.getElementById(`${system}-bar`);
    const text = document.getElementById(`${system}-value`);
    
    if (!bar || !text) return;
    
    const safeValue = Math.max(0, Math.min(100, value));
    bar.style.width = `${safeValue}%`;
    text.textContent = `${Math.round(safeValue)}%`;
    
    // Обновить цвет
    bar.className = 'progress';
    if (safeValue < 20) {
        bar.classList.add('danger');
    } else if (safeValue < 50) {
        bar.classList.add('warning');
    } else {
        bar.classList.add('good');
    }
}

// Обновить карту
function updateMap(location, target) {
    const ctx = mapCanvas.getContext('2d');
    const width = mapCanvas.width;
    const height = mapCanvas.height;
    
    // Очистить
    ctx.clearRect(0, 0, width, height);
    
    // Фон
    ctx.fillStyle = '#0a192f';
    ctx.fillRect(0, 0, width, height);
    
    // Сетка
    ctx.strokeStyle = 'rgba(0, 168, 255, 0.1)';
    ctx.lineWidth = 1;
    
    for (let x = 0; x < width; x += 50) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
    }
    
    for (let y = 0; y < height; y += 50) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
    }
    
    // Масштаб
    const scale = 15;
    const centerX = width / 2;
    const centerY = height / 2;
    
    // Цель
    const targetX = centerX + (target?.x || 10) * scale;
    const targetY = centerY + (target?.y || 10) * scale;
    
    // Позиция
    const posX = centerX + (location?.x || 0) * scale;
    const posY = centerY + (location?.y || 0) * scale;
    
    // Линия к цели
    ctx.strokeStyle = 'rgba(0, 168, 255, 0.3)';
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(posX, posY);
    ctx.lineTo(targetX, targetY);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Цель (крестик)
    ctx.strokeStyle = '#f39c12';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(targetX - 10, targetY);
    ctx.lineTo(targetX + 10, targetY);
    ctx.moveTo(targetX, targetY - 10);
    ctx.lineTo(targetX, targetY + 10);
    ctx.stroke();
    
    // Подлодка
    ctx.fillStyle = '#0066cc';
    ctx.beginPath();
    ctx.arc(posX, posY, 12, 0, Math.PI * 2);
    ctx.fill();
    
    // Обводка подлодки
    ctx.strokeStyle = '#00a8ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(posX, posY, 12, 0, Math.PI * 2);
    ctx.stroke();
    
    // Метка подлодки
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('▲', posX, posY - 15);
}

// Обновить список игроков
function updatePlayersList(players) {
    playersList.innerHTML = '';
    
    if (!players) {
        playersCount.textContent = '0';
        return;
    }
    
    const playerArray = Object.entries(players);
    playersCount.textContent = playerArray.length;
    
    playerArray.forEach(([uid, player]) => {
        const playerElement = document.createElement('div');
        playerElement.className = `player ${player.online ? '' : 'player-offline'}`;
        
        playerElement.innerHTML = `
            <img src="${player.avatar || 'https://via.placeholder.com/40/0066cc/ffffff?text=' + (player.name?.charAt(0) || '?')}" 
                 class="player-avatar" 
                 alt="${player.name}" 
                 crossorigin="anonymous">
            <div class="player-info">
                <div class="player-name">${player.name || 'Аноним'}</div>
                <div class="player-role">${player.role || 'Экипаж'}</div>
            </div>
            ${uid === userId ? '<span class="player-you">Вы</span>' : ''}
        `;
        
        playersList.appendChild(playerElement);
    });
}

// Обновить элементы управления
function updateControls(game) {
    roleControls.innerHTML = '';
    
    const submarine = game.submarine || {};
    
    switch(currentRole) {
        case 'Капитан':
            createCaptainControls(submarine);
            break;
        case 'Штурман':
            createNavigatorControls(submarine);
            break;
        case 'Инженер':
            createEngineerControls(submarine);
            break;
        case 'Акустик':
            createSonarmanControls();
            break;
        case 'Оружейник':
            createWeaponsControls();
            break;
        case 'Связист':
            createCommsControls();
            break;
        default:
            roleControls.innerHTML = '<p>Наблюдатель. Ждите указаний капитана.</p>';
    }
}

// Элементы управления для Капитана
function createCaptainControls(sub) {
    roleControls.innerHTML = `
        <div class="control-group">
            <h4>Управление подлодкой</h4>
            <div class="slider-container">
                <label>Глубина:</label>
                <input type="range" id="depth-slider" min="0" max="500" value="${Math.abs(sub.depth || 0)}">
                <span class="slider-output" id="depth-output">${Math.abs(sub.depth || 0)} м</span>
            </div>
            <div class="slider-container">
                <label>Скорость:</label>
                <input type="range" id="speed-slider" min="0" max="30" value="${sub.speed || 0}">
                <span class="slider-output" id="speed-output">${sub.speed || 0} узлов</span>
            </div>
        </div>
        
        <div class="control-group">
            <h4>Миссия</h4>
            <select id="mission-select">
                <option value="Патрулирование" ${sub.mission === 'Патрулирование' ? 'selected' : ''}>Патрулирование</option>
                <option value="Разведка" ${sub.mission === 'Разведка' ? 'selected' : ''}>Разведка</option>
                <option value="Спасение" ${sub.mission === 'Спасение' ? 'selected' : ''}>Спасение</option>
                <option value="Атака" ${sub.mission === 'Атака' ? 'selected' : ''}>Атака</option>
                <option value="Скрытность" ${sub.mission === 'Скрытность' ? 'selected' : ''}>Скрытность</option>
            </select>
            <button id="change-mission" class="btn primary small" style="margin-top: 10px;">
                <i class="fas fa-check"></i> Изменить миссию
            </button>
        </div>
        
        <div class="control-group">
            <h4>Аварийные команды</h4>
            <button id="emergency-surface" class="btn warning small">
                <i class="fas fa-exclamation-triangle"></i> Аварийное всплытие
            </button>
            <button id="silent-running" class="btn secondary small">
                <i class="fas fa-volume-mute"></i> Тихий ход
            </button>
        </div>
    `;
    
    // Обработчики
    const depthSlider = document.getElementById('depth-slider');
    const speedSlider = document.getElementById('speed-slider');
    
    depthSlider?.addEventListener('input', (e) => {
        const value = e.target.value;
        document.getElementById('depth-output').textContent = `${value} м`;
    });
    
    depthSlider?.addEventListener('change', (e) => {
        updateGameData({ 'submarine/depth': -parseInt(e.target.value) });
    });
    
    speedSlider?.addEventListener('input', (e) => {
        const value = e.target.value;
        document.getElementById('speed-output').textContent = `${value} узлов`;
    });
    
    speedSlider?.addEventListener('change', (e) => {
        updateGameData({ 'submarine/speed': parseInt(e.target.value) });
    });
    
    document.getElementById('change-mission')?.addEventListener('click', () => {
        const mission = document.getElementById('mission-select').value;
        updateGameData({ 'submarine/mission': mission });
        showAlert(`Миссия изменена на: ${mission}`, 'success');
    });
    
    document.getElementById('emergency-surface')?.addEventListener('click', () => {
        updateGameData({ 'submarine/depth': 0, 'submarine/speed': 0 });
        showAlert('АВАРИЯ! Экстренное всплытие!', 'warning');
    });
    
    document.getElementById('silent-running')?.addEventListener('click', () => {
        updateGameData({ 'submarine/speed': 5 });
        showAlert('Включен режим тихого хода', 'info');
    });
}

// Элементы управления для Штурмана
function createNavigatorControls(sub) {
    roleControls.innerHTML = `
        <div class="control-group">
            <h4>Навигация</h4>
            <div class="slider-container">
                <label>Цель X:</label>
                <input type="range" id="target-x" min="-20" max="20" value="${sub.target?.x || 10}">
                <span class="slider-output" id="target-x-output">${sub.target?.x || 10}</span>
            </div>
            <div class="slider-container">
                <label>Цель Y:</label>
                <input type="range" id="target-y" min="-20" max="20" value="${sub.target?.y || 10}">
                <span class="slider-output" id="target-y-output">${sub.target?.y || 10}</span>
            </div>
            <button id="set-course" class="btn primary small" style="margin-top: 10px;">
                <i class="fas fa-compass"></i> Установить курс
            </button>
        </div>
        
        <div class="control-group">
            <h4>Карта</h4>
            <button id="scan-area" class="btn secondary small">
                <i class="fas fa-satellite"></i> Сканировать область
            </button>
            <button id="plot-course" class="btn secondary small">
                <i class="fas fa-route"></i> Проложить маршрут
            </button>
        </div>
    `;
    
    const targetX = document.getElementById('target-x');
    const targetY = document.getElementById('target-y');
    
    targetX?.addEventListener('input', (e) => {
        document.getElementById('target-x-output').textContent = e.target.value;
    });
    
    targetY?.addEventListener('input', (e) => {
        document.getElementById('target-y-output').textContent = e.target.value;
    });
    
    document.getElementById('set-course')?.addEventListener('click', () => {
        const x = parseInt(targetX.value);
        const y = parseInt(targetY.value);
        
        updateGameData({ 
            'submarine/target/x': x,
            'submarine/target/y': y
        });
        
        showAlert(`Курс установлен: X=${x}, Y=${y}`, 'success');
    });
    
    document.getElementById('scan-area')?.addEventListener('click', () => {
        showAlert('Сканирование области... Целей не обнаружено', 'info');
    });
    
    document.getElementById('plot-course')?.addEventListener('click', () => {
        showAlert('Маршрут проложен. Следуйте указаниям на карте', 'info');
    });
}

// Элементы управления для Инженера (сокращённо)
function createEngineerControls(sub) {
    roleControls.innerHTML = `
        <div class="control-group">
            <h4>Распределение энергии</h4>
            <div class="slider-container">
                <label>Двигатели:</label>
                <input type="range" id="power-engines" min="0" max="100" value="40">
                <span class="slider-output" id="power-engines-output">40%</span>
            </div>
            <div class="slider-container">
                <label>Сонар:</label>
                <input type="range" id="power-sonar" min="0" max="100" value="30">
                <span class="slider-output" id="power-sonar-output">30%</span>
            </div>
            <div class="slider-container">
                <label>Жизнеобеспечение:</label>
                <input type="range" id="power-life" min="0" max="100" value="30">
                <span class="slider-output" id="power-life-output">30%</span>
            </div>
            <button id="apply-power" class="btn primary small" style="margin-top: 10px;">
                <i class="fas fa-bolt"></i> Применить
            </button>
        </div>
        
        <div class="control-group">
            <h4>Ремонт</h4>
            <button onclick="repairSystem('hull')" class="btn secondary small">
                <i class="fas fa-tools"></i> Ремонт корпуса
            </button>
            <button onclick="repairSystem('power')" class="btn secondary small">
                <i class="fas fa-car-battery"></i> Восстановить энергию
            </button>
        </div>
    `;
    
    ['engines', 'sonar', 'life'].forEach(type => {
        const slider = document.getElementById(`power-${type}`);
        const output = document.getElementById(`power-${type}-output`);
        
        slider?.addEventListener('input', (e) => {
            output.textContent = `${e.target.value}%`;
        });
    });
    
    document.getElementById('apply-power')?.addEventListener('click', () => {
        const engines = parseInt(document.getElementById('power-engines').value);
        const sonar = parseInt(document.getElementById('power-sonar').value);
        const life = parseInt(document.getElementById('power-life').value);
        
        if (engines + sonar + life !== 100) {
            showAlert('Сумма должна быть 100%!', 'error');
            return;
        }
        
        showAlert(`Энергия распределена: Двигатели ${engines}%, Сонар ${sonar}%, Жизнеобеспечение ${life}%`, 'success');
    });
}

// Простые версии для других ролей
function createSonarmanControls() {
    roleControls.innerHTML = `
        <div class="control-group">
            <h4>Гидролокатор</h4>
            <button id="active-sonar" class="btn primary small">
                <i class="fas fa-broadcast-tower"></i> Активный режим
            </button>
            <button id="passive-sonar" class="btn secondary small">
                <i class="fas fa-ear-listen"></i> Пассивный режим
            </button>
        </div>
        
        <div class="control-group">
            <h4>Обнаружено:</h4>
            <div style="background: rgba(0,0,0,0.3); padding: 10px; border-radius: 8px; font-size: 0.9rem;">
                <p>▸ Контакт #1: Субмарина, 045°, 5км</p>
                <p>▸ Контакт #2: Кит, 120°, 2км</p>
                <p>▸ Контакт #3: Риф, 210°, 1км</p>
            </div>
        </div>
    `;
}

function createWeaponsControls() {
    roleControls.innerHTML = `
        <div class="control-group">
            <h4>Вооружение</h4>
            <p>Торпед: 6/6</p>
            <button id="load-torpedo" class="btn primary small">
                <i class="fas fa-missile"></i> Зарядить торпеду
            </button>
            <button id="fire-torpedo" class="btn danger small">
                <i class="fas fa-fire"></i> Выпустить торпеду
            </button>
        </div>
        
        <div class="control-group">
            <h4>ПВО</h4>
            <button id="activate-countermeasures" class="btn warning small">
                <i class="fas fa-biohazard"></i> Помехи
            </button>
            <button id="evade" class="btn secondary small">
                <i class="fas fa-random"></i> Маневр
            </button>
        </div>
    `;
}

function createCommsControls() {
    roleControls.innerHTML = `
        <div class="control-group">
            <h4>Связь</h4>
            <div style="display: flex; flex-direction: column; gap: 10px;">
                <button onclick="tuneFrequency(121.5)" class="btn small">
                    <i class="fas fa-life-ring"></i> 121.5 МГц (Аварийная)
                </button>
                <button onclick="tuneFrequency(243.0)" class="btn small">
                    <i class="fas fa-shield-alt"></i> 243.0 МГц (Военная)
                </button>
                <button onclick="tuneFrequency(156.8)" class="btn small">
                    <i class="fas fa-ship"></i> 156.8 МГц (Морская)
                </button>
            </div>
        </div>
        
        <div class="control-group">
            <h4>Перехвачено:</h4>
            <div style="background: rgba(0,0,0,0.3); padding: 10px; border-radius: 8px; font-size: 0.9rem;">
                <p>[12:34] Береговая охрана: Шторм в секторе 7</p>
                <p>[13:45] Неизвестный: ...следите за 045...</p>
            </div>
        </div>
    `;
}

// Глобальные функции для кнопок
window.repairSystem = function(system) {
    updateGameData({ 
        [`submarine/${system}`]: 100
    });
    showAlert(`Система ${system} отремонтирована!`, 'success');
};

window.tuneFrequency = function(freq) {
    showAlert(`Настроена частота ${freq} МГц`, 'info');
};

// Обновление данных в Firebase
function updateGameData(updates) {
    if (!gameRef) return;
    
    const gameUpdates = {};
    Object.entries(updates).forEach(([path, value]) => {
        gameUpdates[path] = value;
    });
    
    update(gameRef, gameUpdates).catch(error => {
        console.error('Update error:', error);
        showAlert('Ошибка обновления', 'error');
    });
}

// Показать сигнал тревоги
function showAlert(message, type = 'info') {
    const alertElement = document.createElement('div');
    alertElement.className = 'alert';
    
    const iconMap = {
        success: 'check-circle',
        error: 'exclamation-circle',
        warning: 'exclamation-triangle',
        info: 'info-circle'
    };
    
    alertElement.innerHTML = `
        <i class="fas fa-${iconMap[type] || 'info-circle'}"></i>
        <span>${message}</span>
    `;
    
    alertsList.prepend(alertElement);
    
    // Ограничить количество сообщений
    if (alertsList.children.length > 5) {
        alertsList.removeChild(alertsList.lastChild);
    }
    
    // Автоудаление
    setTimeout(() => {
        if (alertElement.parentNode) {
            alertElement.remove();
        }
    }, 10000);
}

// Обновить список сигналов
function updateAlerts(alerts) {
    alertsList.innerHTML = '';
    
    if (!alerts || alerts.length === 0) {
        alertsList.innerHTML = `
            <div class="alert">
                <i class="fas fa-info-circle"></i>
                <span>Системы в норме</span>
            </div>
        `;
        return;
    }
    
    alerts.forEach(alert => {
        showAlert(alert, 'warning');
    });
}

// Игровой цикл
function startGameLoop() {
    if (gameLoop) clearInterval(gameLoop);
    
    gameLoop = setInterval(async () => {
        if (!gameRef) return;
        
        try {
            const snapshot = await get(gameRef);
            if (!snapshot.exists()) return;
            
            const game = snapshot.val();
            const sub = game.submarine || {};
            
            // Автоматическое движение к цели
            if (sub.speed > 0) {
                const loc = sub.location || {x: 0, y: 0};
                const target = sub.target || {x: 10, y: 10};
                const speed = sub.speed || 0;
                
                const dx = target.x - loc.x;
                const dy = target.y - loc.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance > 0.1) {
                    const ratio = (speed * 0.01) / distance;
                    const newX = loc.x + dx * ratio;
                    const newY = loc.y + dy * ratio;
                    
                    updateGameData({
                        'submarine/location/x': newX,
                        'submarine/location/y': newY
                    });
                }
            }
            
            // Потребление ресурсов
            const updates = {};
            if (sub.oxygen > 0) updates['submarine/oxygen'] = Math.max(0, sub.oxygen - 0.01);
            if (
