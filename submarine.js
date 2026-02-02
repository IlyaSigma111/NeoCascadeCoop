import { 
    auth, database, ref, onValue, update, remove, onChildChanged, 
    onChildAdded, onChildRemoved, set, get, push
} from './firebase-config.js';

// Глобальные переменные
let currentUser = null;
let currentRoom = null;
let currentRole = null;
let gameRef = null;
let gameLoop = null;
let chatListener = null;

// Элементы DOM
const subNameElement = document.getElementById('sub-name');
const missionText = document.getElementById('mission-text');
const depthElement = document.getElementById('depth');
const speedElement = document.getElementById('speed');
const posCoords = document.getElementById('pos-coords');
const targetCoords = document.getElementById('target-coords');
const oxygenBar = document.getElementById('oxygen-bar');
const oxygenValue = document.getElementById('oxygen-value');
const powerBar = document.getElementById('power-bar');
const powerValue = document.getElementById('power-value');
const hullBar = document.getElementById('hull-bar');
const hullValue = document.getElementById('hull-value');
const currentRoleBadge = document.getElementById('current-role');
const roleTitle = document.getElementById('role-title');
const roleControls = document.getElementById('role-controls');
const playersList = document.getElementById('players-list');
const playersCount = document.getElementById('players-count');
const alertsList = document.getElementById('alerts-list');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const sendChatBtn = document.getElementById('send-chat');
const leaveBtn = document.getElementById('leave-game');
const mapCanvas = document.getElementById('map-canvas');
const statusMessage = document.getElementById('status-message');

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

// Показать алерт
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
    
    if (alertsList.children.length > 5) {
        alertsList.removeChild(alertsList.lastChild);
    }
    
    setTimeout(() => {
        if (alertElement.parentNode) {
            alertElement.remove();
        }
    }, 10000);
}

// Обновить систему
function updateSystemDisplay(system, value) {
    const bar = document.getElementById(`${system}-bar`);
    const text = document.getElementById(`${system}-value`);
    
    if (!bar || !text) return;
    
    const safeValue = Math.max(0, Math.min(100, value));
    bar.style.width = `${safeValue}%`;
    text.textContent = `${Math.round(safeValue)}%`;
    
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
    
    ctx.clearRect(0, 0, width, height);
    
    // Фон
    ctx.fillStyle = '#0a192f';
    ctx.fillRect(0, 0, width, height);
    
    // Сетка
    ctx.strokeStyle = 'rgba(0, 168, 255, 0.1)';
    ctx.lineWidth = 1;
    
    for (let x = 0; x < width; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
    }
    
    for (let y = 0; y < height; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
    }
    
    // Масштаб
    const scale = 12;
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
    
    // Цель
    ctx.strokeStyle = '#ffa502';
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
    ctx.arc(posX, posY, 10, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.strokeStyle = '#00a8ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(posX, posY, 10, 0, Math.PI * 2);
    ctx.stroke();
    
    // Стрелка направления
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('▲', posX, posY - 12);
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
        playerElement.className = 'player';
        
        playerElement.innerHTML = `
            <img src="${player.avatar || `https://ui-avatars.com/api/?name=${player.name?.charAt(0) || '?'}&background=0066cc&color=fff&size=100`}" 
                 class="player-avatar" 
                 alt="${player.name}"
                 crossorigin="anonymous"
                 referrerpolicy="no-referrer">
            <div class="player-info">
                <div class="player-name">${player.name || 'Аноним'}</div>
                <div class="player-role">${player.role || 'Экипаж'}</div>
            </div>
            ${uid === currentUser?.uid ? '<span class="player-you">Вы</span>' : ''}
        `;
        
        playersList.appendChild(playerElement);
    });
}

// Обновить элементы управления
function updateControls(game) {
    const submarine = game.submarine || {};
    currentRoleBadge.textContent = currentRole;
    roleTitle.textContent = `Ваша роль: ${currentRole}`;
    
    roleControls.innerHTML = '';
    
    // Капитан
    if (currentRole === 'Капитан') {
        roleControls.innerHTML = `
            <div class="control-group">
                <h4><i class="fas fa-water"></i> Глубина</h4>
                <div class="slider-container">
                    <label>Глубина:</label>
                    <input type="range" id="depth-slider" min="0" max="500" value="${Math.abs(submarine.depth || 0)}">
                    <span class="slider-output" id="depth-output">${Math.abs(submarine.depth || 0)} м</span>
                </div>
            </div>
            
            <div class="control-group">
                <h4><i class="fas fa-tachometer-alt"></i> Скорость</h4>
                <div class="slider-container">
                    <label>Скорость:</label>
                    <input type="range" id="speed-slider" min="0" max="30" value="${submarine.speed || 0}">
                    <span class="slider-output" id="speed-output">${submarine.speed || 0} узлов</span>
                </div>
            </div>
            
            <div class="control-group">
                <h4><i class="fas fa-crosshairs"></i> Миссия</h4>
                <select id="mission-select" style="width: 100%; padding: 10px; border-radius: 8px; background: rgba(255,255,255,0.08); color: white; border: 1px solid var(--border); margin-bottom: 10px;">
                    <option value="Патрулирование" ${submarine.mission === 'Патрулирование' ? 'selected' : ''}>Патрулирование</option>
                    <option value="Разведка" ${submarine.mission === 'Разведка' ? 'selected' : ''}>Разведка</option>
                    <option value="Спасение" ${submarine.mission === 'Спасение' ? 'selected' : ''}>Спасение</option>
                    <option value="Атака" ${submarine.mission === 'Атака' ? 'selected' : ''}>Атака</option>
                </select>
                <button id="change-mission" class="btn primary small" style="width: 100%;">
                    <i class="fas fa-check"></i> Изменить миссию
                </button>
            </div>
        `;
        
        // Обработчики для капитана
        const depthSlider = document.getElementById('depth-slider');
        const speedSlider = document.getElementById('speed-slider');
        
        depthSlider?.addEventListener('input', (e) => {
            document.getElementById('depth-output').textContent = `${e.target.value} м`;
        });
        
        depthSlider?.addEventListener('change', (e) => {
            updateGameData({ 'submarine/depth': -parseInt(e.target.value) });
        });
        
        speedSlider?.addEventListener('input', (e) => {
            document.getElementById('speed-output').textContent = `${e.target.value} узлов`;
        });
        
        speedSlider?.addEventListener('change', (e) => {
            updateGameData({ 'submarine/speed': parseInt(e.target.value) });
        });
        
        document.getElementById('change-mission')?.addEventListener('click', () => {
            const mission = document.getElementById('mission-select').value;
            updateGameData({ 'submarine/mission': mission });
            showStatus(`Миссия изменена: ${mission}`, 'success');
        });
    }
    
    // Штурман
    else if (currentRole === 'Штурман') {
        roleControls.innerHTML = `
            <div class="control-group">
                <h4><i class="fas fa-compass"></i> Навигация</h4>
                <div class="slider-container">
                    <label>Цель X:</label>
                    <input type="range" id="target-x" min="-20" max="20" value="${submarine.target?.x || 10}">
                    <span class="slider-output" id="target-x-output">${submarine.target?.x || 10}</span>
                </div>
                <div class="slider-container">
                    <label>Цель Y:</label>
                    <input type="range" id="target-y" min="-20" max="20" value="${submarine.target?.y || 10}">
                    <span class="slider-output" id="target-y-output">${submarine.target?.y || 10}</span>
                </div>
                <button id="set-course" class="btn primary small" style="width: 100%; margin-top: 10px;">
                    <i class="fas fa-compass"></i> Установить курс
                </button>
            </div>
            
            <div class="control-group">
                <h4><i class="fas fa-satellite"></i> Сканирование</h4>
                <button id="scan-area" class="btn secondary small" style="width: 100%; margin-bottom: 5px;">
                    <i class="fas fa-satellite"></i> Сканировать область
                </button>
                <button id="plot-course" class="btn secondary small" style="width: 100%;">
                    <i class="fas fa-route"></i> Проложить маршрут
                </button>
            </div>
        `;
        
        // Обработчики для штурмана
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
            
            showStatus(`Курс установлен: X=${x}, Y=${y}`, 'success');
        });
        
        document.getElementById('scan-area')?.addEventListener('click', () => {
            showStatus('Сканирование области...', 'info');
            setTimeout(() => showAlert('Область сканирована. Целей не обнаружено.', 'info'), 1000);
        });
        
        document.getElementById('plot-course')?.addEventListener('click', () => {
            showStatus('Маршрут проложен', 'info');
        });
    }
    
    // Инженер
    else if (currentRole === 'Инженер') {
        roleControls.innerHTML = `
            <div class="control-group">
                <h4><i class="fas fa-bolt"></i> Энергия</h4>
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
                <button id="apply-power" class="btn primary small" style="width: 100%; margin-top: 10px;">
                    <i class="fas fa-bolt"></i> Применить
                </button>
            </div>
            
            <div class="control-group">
                <h4><i class="fas fa-tools"></i> Ремонт</h4>
                <button onclick="repairSystem('hull')" class="btn secondary small" style="width: 100%; margin-bottom: 5px;">
                    <i class="fas fa-tools"></i> Ремонт корпуса
                </button>
                <button onclick="repairSystem('power')" class="btn secondary small" style="width: 100%;">
                    <i class="fas fa-car-battery"></i> Восстановить энергию
                </button>
            </div>
        `;
        
        // Обработчики для инженера
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
                showStatus('Сумма должна быть 100%!', 'error');
                return;
            }
            
            showStatus(`Энергия распределена`, 'success');
        });
        
        window.repairSystem = function(system) {
            updateGameData({ 
                [`submarine/${system}`]: 100
            });
            showStatus(`Система ${system} отремонтирована!`, 'success');
        };
    }
    
    // Остальные роли (упрощённо)
    else {
        const roleControlsMap = {
            'Акустик': `
                <div class="control-group">
                    <h4><i class="fas fa-ear-listen"></i> Гидролокатор</h4>
                    <button class="btn primary small" style="width: 100%; margin-bottom: 5px;">
                        <i class="fas fa-broadcast-tower"></i> Активный режим
                    </button>
                    <button class="btn secondary small" style="width: 100%;">
                        <i class="fas fa-ear-listen"></i> Пассивный режим
                    </button>
                </div>
                <div class="control-group">
                    <h4><i class="fas fa-satellite-dish"></i> Контакты</h4>
                    <div style="background: rgba(0,0,0,0.3); padding: 10px; border-radius: 8px; font-size: 0.9rem;">
                        <p>▸ Контакт #1: Субмарина, 045°, 5км</p>
                        <p>▸ Контакт #2: Кит, 120°, 2км</p>
                    </div>
                </div>
            `,
            'Оружейник': `
                <div class="control-group">
                    <h4><i class="fas fa-missile"></i> Вооружение</h4>
                    <p style="margin-bottom: 10px; color: var(--gray);">Торпед: 6/6</p>
                    <button class="btn primary small" style="width: 100%; margin-bottom: 5px;">
                        <i class="fas fa-missile"></i> Зарядить торпеду
                    </button>
                    <button class="btn danger small" style="width: 100%;">
                        <i class="fas fa-fire"></i> Выпустить торпеду
                    </button>
                </div>
            `,
            'Связист': `
                <div class="control-group">
                    <h4><i class="fas fa-broadcast-tower"></i> Связь</h4>
                    <div style="display: flex; flex-direction: column; gap: 8px;">
                        <button class="btn secondary small">
                            <i class="fas fa-life-ring"></i> 121.5 МГц (Аварийная)
                        </button>
                        <button class="btn secondary small">
                            <i class="fas fa-shield-alt"></i> 243.0 МГц (Военная)
                        </button>
                        <button class="btn secondary small">
                            <i class="fas fa-ship"></i> 156.8 МГц (Морская)
                        </button>
                    </div>
                </div>
            `
        };
        
        roleControls.innerHTML = roleControlsMap[currentRole] || `
            <div class="control-group">
                <h4><i class="fas fa-info-circle"></i> Информация</h4>
                <p style="color: var(--gray);">Наблюдатель. Ждите указаний капитана.</p>
            </div>
        `;
    }
}

// Обновить данные игры
function updateGameData(updates) {
    if (!gameRef) return;
    
    const gameUpdates = {};
    Object.entries(updates).forEach(([path, value]) => {
        gameUpdates[path] = value;
    });
    
    update(gameRef, gameUpdates).catch(error => {
        console.error('Update error:', error);
        showStatus('Ошибка обновления', 'error');
    });
}

// Настройка чата
function setupChat() {
    const chatRef = ref(database, `games/${currentRoom}/chat`);
    
    if (chatListener) chatListener();
    
    chatListener = onValue(chatRef, (snapshot) => {
        chatMessages.innerHTML = '';
        
        if (!snapshot.exists()) return;
        
        const messages = snapshot.val();
        const messagesArray = Object.values(messages || {}).sort((a, b) => a.timestamp - b.timestamp);
        
        messagesArray.forEach(msg => {
            addChatMessage(msg);
        });
        
        setTimeout(() => {
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }, 100);
    });
    
    // Отправка сообщений
    sendChatBtn.addEventListener('click', sendMessage);
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
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
            showStatus('Ошибка отправки', 'error');
        });
}

// Добавить сообщение
function addChatMessage(msg) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'chat-message';
    
    const time = new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    const isOwn = msg.senderId === currentUser?.uid;
    
    messageDiv.innerHTML = `
        <span class="sender" style="color: ${isOwn ? '#00a8ff' : '#2ed573'}">${msg.sender}</span>
        <span class="role">(${msg.role})</span>
        <span class="time">${time}</span>
        <span class="text">${msg.text}</span>
    `;
    
    chatMessages.appendChild(messageDiv);
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
            
            // Автоматическое движение
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
            if (sub.power > 0) updates['submarine/power'] = Math.max(0, sub.power - 0.02);
            if (sub.hull > 0 && sub.depth < -300) updates['submarine/hull'] = Math.max(0, sub.hull - 0.01);
            
            if (Object.keys(updates).length > 0) {
                updateGameData(updates);
            }
            
            // Критические уровни
            if (sub.oxygen < 20) {
                showAlert('Низкий уровень кислорода!', 'danger');
            }
            if (sub.power < 15) {
                showAlert('Низкий уровень энергии!', 'warning');
            }
            if (sub.hull < 30) {
                showAlert('Повреждён корпус!', 'danger');
            }
            
        } catch (error) {
            console.error('Game loop error:', error);
        }
    }, 5000);
}

// Обновить отображение игры
function updateGameDisplay(game) {
    subNameElement.textContent = game.name || 'Без названия';
    missionText.textContent = game.submarine?.mission || 'Патрулирование';
    
    const depth = Math.abs(game.submarine?.depth || 0);
    const speed = game.submarine?.speed || 0;
    
    depthElement.textContent = depth;
    speedElement.textContent = speed;
    
    // Координаты
    const loc = game.submarine?.location || {x: 0, y: 0};
    const target = game.submarine?.target || {x: 10, y: 10};
    
    posCoords.textContent = `${loc.x.toFixed(1)}, ${loc.y.toFixed(1)}`;
    targetCoords.textContent = `${target.x}, ${target.y}`;
    
    // Системы
    updateSystemDisplay('oxygen', game.submarine?.oxygen || 100);
    updateSystemDisplay('power', game.submarine?.power || 100);
    updateSystemDisplay('hull', game.submarine?.hull || 100);
    
    // Роль
    currentRoleBadge.textContent = currentRole;
    roleTitle.textContent = `Ваша роль: ${currentRole}`;
    
    // Карта
    updateMap(loc, target);
    
    // Алерты
    if (game.submarine?.alerts) {
        updateAlerts(game.submarine.alerts);
    }
}

// Обновить алерты
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

// Инициализация игры
async function init() {
    currentRoom = localStorage.getItem('neocascade_room');
    currentRole = localStorage.getItem('neocascade_role');
    
    if (!currentRoom || !currentRole) {
        showStatus('Ошибка: данные игры не найдены', 'error', 2000);
        setTimeout(() => window.location.href = 'index.html', 2000);
        return;
    }
    
    auth.onAuthStateChanged((user) => {
        if (user) {
            currentUser = user;
            loadGame();
            setupChat();
            startGameLoop();
        } else {
            window.location.href = 'index.html';
        }
    }, (error) => {
        console.error('Auth error:', error);
        window.location.href = 'index.html';
    });
}

// Загрузка игры
function loadGame() {
    gameRef = ref(database, `games/${currentRoom}`);
    
    // Слушатель игры
    onValue(gameRef, (snapshot) => {
        if (!snapshot.exists()) {
            showStatus('Игра не найдена!', 'error', 2000);
            setTimeout(() => window.location.href = 'index.html', 2000);
            return;
        }
        
        const game = snapshot.val();
        updateGameDisplay(game);
        updateControls(game);
    }, { onlyOnce: false });
    
    // Слушатель игроков
    const playersRef = ref(database, `games/${currentRoom}/players`);
    onValue(playersRef, (snapshot) => {
        updatePlayersList(snapshot.val());
    });
    
    // Изменения игроков
    onChildChanged(playersRef, (snapshot) => {
        const player = snapshot.val();
        if (player.name && snapshot.key !== currentUser?.uid) {
            showAlert(`${player.name} теперь ${player.role}`, 'info');
        }
    });
    
    // Новые игроки
    onChildAdded(playersRef, (snapshot) => {
        const player = snapshot.val();
        if (snapshot.key !== currentUser?.uid && player.name) {
            showAlert(`${player.name} присоединился как ${player.role}`, 'success');
        }
    });
    
    // Ушедшие игроки
    onChildRemoved(playersRef, (snapshot) => {
        const player = snapshot.val();
        if (player && player.name && snapshot.key !== currentUser?.uid) {
            showAlert(`${player.name} покинул подлодку`, 'warning');
        }
    });
}

// Выход из игры
leaveBtn.addEventListener('click', async () => {
    if (confirm('Покинуть подлодку?')) {
        try {
            leaveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Выход...';
            leaveBtn.disabled = true;
            
            const snapshot = await get(gameRef);
            if (snapshot.exists()) {
                const game = snapshot.val();
                
                await update(gameRef, {
                    [`players/${currentUser.uid}`]: null,
                    'currentPlayers': Math.max(0, (game.currentPlayers || 1) - 1)
                });
                
                const updatedSnapshot = await get(gameRef);
                const updatedGame = updatedSnapshot.val();
                
                if (!updatedGame.players || Object.keys(updatedGame.players).length === 0) {
                    await remove(gameRef);
                }
            }
            
            localStorage.removeItem('neocascade_room');
            localStorage.removeItem('neocascade_role');
            localStorage.removeItem('neocascade_userId');
            
            showStatus('Вы покинули подлодку', 'info', 1000);
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 1000);
            
        } catch (error) {
            console.error('Leave error:', error);
            showStatus('Ошибка выхода', 'error');
            leaveBtn.innerHTML = '<i class="fas fa-door-open"></i> Выйти';
            leaveBtn.disabled = false;
        }
    }
});

// Очистка при закрытии
window.addEventListener('beforeunload', () => {
    if (gameLoop) clearInterval(gameLoop);
    if (chatListener) chatListener();
    
    if (gameRef && currentUser) {
        update(gameRef, {
            [`players/${currentUser.uid}/online`]: false
        }).catch(console.error);
    }
});

// Обработка свайпа для мобилок
let touchStartY = 0;
document.addEventListener('touchstart', (e) => {
    touchStartY = e.touches[0].clientY;
}, { passive: true });

document.addEventListener('touchend', (e) => {
    const touchEndY = e.changedTouches[0].clientY;
    const diff = touchStartY - touchEndY;
    
    if (diff > 100 && window.scrollY <= 0) {
        showStatus('Обновление данных...', 'info');
        setTimeout(() => showStatus('Данные обновлены', 'success'), 500);
    }
}, { passive: true });

// Запуск
init();
