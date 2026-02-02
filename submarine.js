import { 
    auth, database, ref, onValue, update, remove, onChildAdded, onChildChanged
} from './firebase-config.js';

// Глобальные переменные
let currentUser = null;
let currentRoom = null;
let currentRole = null;
let gameRef = null;
let playersListener = null;
let submarineListener = null;

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
const roleTitle = document.getElementById('role-title');
const roleControls = document.getElementById('role-controls');
const playersList = document.getElementById('players-list');
const alertsList = document.getElementById('alerts-list');
const leaveBtn = document.getElementById('leave-game');
const mapCanvas = document.getElementById('map-canvas');

// Инициализация
async function init() {
    currentRoom = localStorage.getItem('neocascade_room');
    currentRole = localStorage.getItem('neocascade_role');
    
    if (!currentRoom || !currentRole) {
        alert('Ошибка: данные игры не найдены');
        window.location.href = 'index.html';
        return;
    }
    
    // Проверить аутентификацию
    auth.onAuthStateChanged((user) => {
        if (user) {
            currentUser = user;
            loadGame();
        } else {
            window.location.href = 'index.html';
        }
    });
}

// Загрузка игры
function loadGame() {
    gameRef = ref(database, `games/${currentRoom}`);
    
    // Слушатель данных подлодки
    submarineListener = onValue(gameRef, (snapshot) => {
        if (!snapshot.exists()) {
            alert('Игра не найдена!');
            window.location.href = 'index.html';
            return;
        }
        
        const game = snapshot.val();
        updateGameDisplay(game);
        updateControls(game);
    });
    
    // Слушатель списка игроков
    const playersRef = ref(database, `games/${currentRoom}/players`);
    playersListener = onValue(playersRef, (snapshot) => {
        updatePlayersList(snapshot.val());
    });
    
    // Слушатель изменений игроков
    onChildChanged(playersRef, (snapshot) => {
        updatePlayerStatus(snapshot.key, snapshot.val());
    });
    
    // Слушатель новых игроков
    onChildAdded(playersRef, (snapshot) => {
        showAlert(`${snapshot.val().name} присоединился к экипажу как ${snapshot.val().role}`);
    });
}

// Обновление отображения игры
function updateGameDisplay(game) {
    subNameElement.textContent = game.name;
    missionText.textContent = game.submarine.mission;
    depthElement.textContent = Math.abs(game.submarine.depth);
    speedElement.textContent = game.submarine.speed;
    
    // Обновить системы
    updateSystemDisplay('oxygen', game.submarine.oxygen);
    updateSystemDisplay('power', game.submarine.power);
    updateSystemDisplay('hull', game.submarine.hull);
    
    // Обновить карту
    updateMap(game.submarine.location, game.submarine.target);
    
    // Показать сигналы тревоги
    updateAlerts(game.submarine.alerts);
}

// Обновление отображения системы
function updateSystemDisplay(system, value) {
    const bar = document.getElementById(`${system}-bar`);
    const text = document.getElementById(`${system}-value`);
    
    bar.style.width = `${value}%`;
    text.textContent = `${value}%`;
    
    // Изменить цвет в зависимости от значения
    bar.className = 'progress';
    if (value < 20) {
        bar.classList.add('danger');
    } else if (value < 50) {
        bar.classList.add('warning');
    } else {
        bar.classList.add('good');
    }
}

// Обновление карты
function updateMap(location, target) {
    const ctx = mapCanvas.getContext('2d');
    const width = mapCanvas.width;
    const height = mapCanvas.height;
    
    // Очистить canvas
    ctx.clearRect(0, 0, width, height);
    
    // Нарисовать фон (океан)
    ctx.fillStyle = '#0a192f';
    ctx.fillRect(0, 0, width, height);
    
    // Нарисовать сетку
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    
    // Горизонтальные линии
    for (let y = 0; y < height; y += 50) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
    }
    
    // Вертикальные линии
    for (let x = 0; x < width; x += 50) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
    }
    
    // Нормализовать координаты для отображения
    const scale = 10;
    const centerX = width / 2;
    const centerY = height / 2;
    
    // Текущая позиция
    const posX = centerX + location.x * scale;
    const posY = centerY + location.y * scale;
    
    // Целевая позиция
    const targetX = centerX + target.x * scale;
    const targetY = centerY + target.y * scale;
    
    // Нарисовать линию к цели
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(posX, posY);
    ctx.lineTo(targetX, targetY);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Нарисовать цель
    ctx.fillStyle = '#fbbc05';
    ctx.beginPath();
    ctx.arc(targetX, targetY, 8, 0, Math.PI * 2);
    ctx.fill();
    
    // Нарисовать подлодку
    ctx.fillStyle = '#1a73e8';
    ctx.beginPath();
    ctx.arc(posX, posY, 12, 0, Math.PI * 2);
    ctx.fill();
    
    // Добавить метку подлодки
    ctx.fillStyle = '#ffffff';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Мы здесь', posX, posY - 20);
}

// Обновление списка игроков
function updatePlayersList(players) {
    playersList.innerHTML = '';
    
    if (!players) return;
    
    Object.entries(players).forEach(([uid, player]) => {
        const playerElement = document.createElement('div');
        playerElement.className = 'player';
        playerElement.id = `player-${uid}`;
        
        const roleClass = getRoleClass(player.role);
        
        playerElement.innerHTML = `
            <img src="${player.avatar || 'https://via.placeholder.com/40'}" 
                 class="player-avatar" 
                 alt="${player.name}">
            <div class="player-info">
                <strong>${player.name}</strong>
                <div class="player-role">
                    <span class="role-badge ${roleClass}">${player.role}</span>
                </div>
            </div>
            ${uid === currentUser.uid ? '<span>👤 Вы</span>' : ''}
        `;
        
        playersList.appendChild(playerElement);
    });
}

// Обновление статуса игрока
function updatePlayerStatus(uid, player) {
    const playerElement = document.getElementById(`player-${uid}`);
    if (playerElement) {
        const roleClass = getRoleClass(player.role);
        playerElement.innerHTML = `
            <img src="${player.avatar || 'https://via.placeholder.com/40'}" 
                 class="player-avatar" 
                 alt="${player.name}">
            <div class="player-info">
                <strong>${player.name}</strong>
                <div class="player-role">
                    <span class="role-badge ${roleClass}">${player.role}</span>
                </div>
            </div>
            ${uid === currentUser.uid ? '<span>👤 Вы</span>' : ''}
        `;
    }
}

// Получить CSS класс для роли
function getRoleClass(role) {
    const roleMap = {
        'Капитан': 'captain',
        'Штурман': 'navigator',
        'Инженер': 'engineer',
        'Акустик': 'sonarman',
        'Оружейник': 'weapons',
        'Связист': 'comms'
    };
    return roleMap[role] || 'crew';
}

// Обновление элементов управления в зависимости от роли
function updateControls(game) {
    roleTitle.textContent = `Вы: ${currentRole}`;
    roleControls.innerHTML = '';
    
    switch(currentRole) {
        case 'Капитан':
            createCaptainControls(game);
            break;
        case 'Штурман':
            createNavigatorControls(game);
            break;
        case 'Инженер':
            createEngineerControls(game);
            break;
        case 'Акустик':
            createSonarmanControls(game);
            break;
        case 'Оружейник':
            createWeaponsControls(game);
            break;
        case 'Связист':
            createCommsControls(game);
            break;
        default:
            roleControls.innerHTML = '<p>Наблюдатель. Ждите указаний капитана.</p>';
    }
}

// Элементы управления для Капитана
function createCaptainControls(game) {
    const controls = `
        <div class="control-group">
            <h3>Управление подлодкой</h3>
            <div class="slider-container">
                <label>Глубина:</label>
                <input type="range" id="depth-slider" min="0" max="500" value="${Math.abs(game.submarine.depth)}">
                <span id="depth-output">${Math.abs(game.submarine.depth)} м</span>
            </div>
            <div class="slider-container">
                <label>Скорость:</label>
                <input type="range" id="speed-slider" min="0" max="30" value="${game.submarine.speed}">
                <span id="speed-output">${game.submarine.speed} узлов</span>
            </div>
        </div>
        
        <div class="control-group">
            <h3>Миссия</h3>
            <select id="mission-select">
                <option value="Патрулирование" ${game.submarine.mission === 'Патрулирование' ? 'selected' : ''}>Патрулирование</option>
                <option value="Разведка" ${game.submarine.mission === 'Разведка' ? 'selected' : ''}>Разведка</option>
                <option value="Спасение" ${game.submarine.mission === 'Спасение' ? 'selected' : ''}>Спасение</option>
                <option value="Атака" ${game.submarine.mission === 'Атака' ? 'selected' : ''}>Атака</option>
                <option value="Скрытность" ${game.submarine.mission === 'Скрытность' ? 'selected' : ''}>Скрытность</option>
            </select>
            <button id="change-mission" class="btn primary">Изменить миссию</button>
        </div>
        
        <div class="control-group">
            <h3>Аварийные команды</h3>
            <button id="emergency-surface" class="btn warning">Аварийное всплытие</button>
            <button id="silent-running" class="btn secondary">Тихий ход</button>
        </div>
    `;
    
    roleControls.innerHTML = controls;
    
    // Обработчики событий
    document.getElementById('depth-slider').addEventListener('input', (e) => {
        const value = e.target.value;
        document.getElementById('depth-output').textContent = `${value} м`;
        updateGameData({ 'submarine/depth': -parseInt(value) });
    });
    
    document.getElementById('speed-slider').addEventListener('input', (e) => {
        const value = e.target.value;
        document.getElementById('speed-output').textContent = `${value} узлов`;
        updateGameData({ 'submarine/speed': parseInt(value) });
    });
    
    document.getElementById('change-mission').addEventListener('click', () => {
        const mission = document.getElementById('mission-select').value;
        updateGameData({ 'submarine/mission': mission });
        showAlert(`Миссия изменена на: ${mission}`);
    });
    
    document.getElementById('emergency-surface').addEventListener('click', () => {
        updateGameData({ 'submarine/depth': 0, 'submarine/speed': 0 });
        showAlert('АВАРИЯ! Экстренное всплытие!');
    });
    
    document.getElementById('silent-running').addEventListener('click', () => {
        updateGameData({ 'submarine/speed': 5 });
        showAlert('Включен режим тихого хода');
    });
}

// Элементы управления для Штурмана
function createNavigatorControls(game) {
    const controls = `
        <div class="control-group">
            <h3>Навигация</h3>
            <p>Текущие координаты: X=${game.submarine.location.x}, Y=${game.submarine.location.y}</p>
            <div class="slider-container">
                <label>Цель X:</label>
                <input type="range" id="target-x" min="-20" max="20" value="${game.submarine.target.x}">
                <span id="target-x-output">${game.submarine.target.x}</span>
            </div>
            <div class="slider-container">
                <label>Цель Y:</label>
                <input type="range" id="target-y" min="-20" max="20" value="${game.submarine.target.y}">
                <span id="target-y-output">${game.submarine.target.y}</span>
            </div>
            <button id="set-course" class="btn primary">Установить курс</button>
        </div>
        
        <div class="control-group">
            <h3>Карта</h3>
            <button id="scan-area" class="btn secondary">Сканировать область</button>
            <button id="plot-course" class="btn secondary">Проложить маршрут</button>
        </div>
    `;
    
    roleControls.innerHTML = controls;
    
    // Обработчики событий
    document.getElementById('target-x').addEventListener('input', (e) => {
        const value = e.target.value;
        document.getElementById('target-x-output').textContent = value;
    });
    
    document.getElementById('target-y').addEventListener('input', (e) => {
        const value = e.target.value;
        document.getElementById('target-y-output').textContent = value;
    });
    
    document.getElementById('set-course').addEventListener('click', () => {
        const targetX = parseInt(document.getElementById('target-x').value);
        const targetY = parseInt(document.getElementById('target-y').value);
        
        updateGameData({ 
            'submarine/target/x': targetX,
            'submarine/target/y': targetY
        });
        
        showAlert(`Курс установлен на координаты: X=${targetX}, Y=${targetY}`);
    });
    
    document.getElementById('scan-area').addEventListener('click', () => {
        showAlert('Сканирование области... Объектов не обнаружено');
    });
    
    document.getElementById('plot-course').addEventListener('click', () => {
        showAlert('Маршрут проложен. Следуйте указаниям на карте');
    });
}

// Элементы управления для Инженера
function createEngineerControls(game) {
    const controls = `
        <div class="control-group">
            <h3>Распределение энергии</h3>
            <div class="slider-container">
                <label>Двигатели:</label>
                <input type="range" id="power-engines" min="0" max="100" value="50">
                <span id="power-engines-output">50%</span>
            </div>
            <div class="slider-container">
                <label>Гидролокатор:</label>
                <input type="range" id="power-sonar" min="0" max="100" value="30">
                <span id="power-sonar-output">30%</span>
            </div>
            <div class="slider-container">
                <label>Жизнеобеспечение:</label>
                <input type="range" id="power-life" min="0" max="100" value="20">
                <span id="power-life-output">20%</span>
            </div>
            <button id="apply-power" class="btn primary">Применить распределение</button>
        </div>
        
        <div class="control-group">
            <h3>Ремонт систем</h3>
            <div class="system-status">
                <div class="system">
                    <h4>Двигатели: ${game.submarine.systems.engines}%</h4>
                    <button class="btn small" onclick="repairSystem('engines')">Ремонт</button>
                </div>
                <div class="system">
                    <h4>Гидролокатор: ${game.submarine.systems.sonar}%</h4>
                    <button class="btn small" onclick="repairSystem('sonar')">Ремонт</button>
                </div>
                <div class="system">
                    <h4>Связь: ${game.submarine.systems.comms}%</h4>
                    <button class="btn small" onclick="repairSystem('comms')">Ремонт</button>
                </div>
            </div>
        </div>
    `;
    
    roleControls.innerHTML = controls;
    
    // Обработчики событий для ползунков
    ['engines', 'sonar', 'life'].forEach(type => {
        const slider = document.getElementById(`power-${type}`);
        const output = document.getElementById(`power-${type}-output`);
        
        slider.addEventListener('input', (e) => {
            output.textContent = `${e.target.value}%`;
        });
    });
    
    document.getElementById('apply-power').addEventListener('click', () => {
        const engines = parseInt(document.getElementById('power-engines').value);
        const sonar = parseInt(document.getElementById('power-sonar').value);
        const life = parseInt(document.getElementById('power-life').value);
        
        if (engines + sonar + life !== 100) {
            showAlert('Сумма распределения должна быть 100%!', 'error');
            return;
        }
        
        showAlert(`Энергия распределена: Двигатели ${engines}%, Гидролокатор ${sonar}%, Жизнеобеспечение ${life}%`);
    });
}

// Дополнительные роли (сокращённо)
function createSonarmanControls(game) {
    roleControls.innerHTML = `
        <div class="control-group">
            <h3>Гидролокатор</h3>
            <button id="active-sonar" class="btn primary">Активный гидролокатор</button>
            <button id="passive-sonar" class="btn secondary">Пассивный режим</button>
            <div id="sonar-display" style="margin-top: 20px; background: #000; height: 200px; border-radius: 8px;">
                <!-- Здесь будет отображение сонара -->
            </div>
        </div>
        
        <div class="control-group">
            <h3>Обнаружение</h3>
            <div id="contacts-list">
                <p>Контакт #1: Неопознанная субмарина, пеленг 045, расстояние 5000м</p>
                <p>Контакт #2: Кит, пеленг 120, расстояние 2000м</p>
            </div>
        </div>
    `;
}

function createWeaponsControls(game) {
    roleControls.innerHTML = `
        <div class="control-group">
            <h3>Вооружение</h3>
            <p>Торпед в наличии: 6</p>
            <button id="load-torpedo" class="btn primary">Зарядить торпеду</button>
            <button id="fire-torpedo" class="btn danger">Выпустить торпеду</button>
            
            <div class="control-group">
                <h4>Выбор цели</h4>
                <select id="target-select">
                    <option value="contact1">Контакт #1 (субмарина)</option>
                    <option value="contact2">Контакт #2 (кит)</option>
                </select>
            </div>
        </div>
        
        <div class="control-group">
            <h3>Системы ПВО</h3>
            <button id="activate-countermeasures" class="btn warning">Активировать помехи</button>
            <button id="evade" class="btn secondary">Маневр уклонения</button>
        </div>
    `;
}

function createCommsControls(game) {
    roleControls.innerHTML = `
        <div class="control-group">
            <h3>Связь</h3>
            <textarea id="message-input" placeholder="Введите сообщение..." rows="3" style="width: 100%;"></textarea>
            <button id="send-message" class="btn primary">Отправить сообщение</button>
            
            <div class="control-group">
                <h4>Частоты</h4>
                <button class="btn small" onclick="tuneFrequency(121.5)">Аварийная 121.5 МГц</button>
                <button class="btn small" onclick="tuneFrequency(243.0)">Военная 243.0 МГц</button>
                <button class="btn small" onclick="tuneFrequency(156.8)">Морская 156.8 МГц</button>
            </div>
        </div>
        
        <div class="control-group">
            <h3>Перехваченные сообщения</h3>
            <div id="intercepted-messages">
                <p>[12:34] Береговая охрана: Штормовое предупреждение</p>
                <p>[13:45] Неопознанный: Следите за сектором 7</p>
            </div>
        </div>
    `;
}

// Обновление данных в Firebase
function updateGameData(updates) {
    if (!gameRef) return;
    
    const gameUpdates = {};
    Object.entries(updates).forEach(([path, value]) => {
        gameUpdates[path] = value;
    });
    
    update(gameRef, gameUpdates).catch(error => {
        console.error('Ошибка обновления:', error);
        showAlert('Ошибка обновления данных', 'error');
    });
}

// Показать сигнал тревоги
function showAlert(message, type = 'info') {
    const alertElement = document.createElement('div');
    alertElement.className = `alert ${type}`;
    alertElement.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    
    alertsList.prepend(alertElement);
    
    // Удалить старое сообщение, если их слишком много
    if (alertsList.children.length > 5) {
        alertsList.removeChild(alertsList.lastChild);
    }
    
    // Автоматическое удаление через 10 секунд
    setTimeout(() => {
        if (alertElement.parentNode) {
            alertElement.remove();
        }
    }, 10000);
}

// Обновление списка сигналов тревоги
function updateAlerts(alerts) {
    alertsList.innerHTML = '';
    
    if (!alerts || alerts.length === 0) {
        alertsList.innerHTML = '<p>Нет активных сигналов</p>';
        return;
    }
    
    alerts.forEach(alert => {
        const alertElement = document.createElement('div');
        alertElement.className = 'alert';
        alertElement.textContent = alert;
        alertsList.appendChild(alertElement);
    });
}

// Функция ремонта системы (глобальная для кнопок)
window.repairSystem = function(system) {
    updateGameData({ 
        [`submarine/systems/${system}`]: 100,
        'submarine/power': 90  // Ремонт потребляет энергию
    });
    showAlert(`Система ${system} отремонтирована!`);
};

// Покинуть игру
leaveBtn.addEventListener('click', async () => {
    if (confirm('Покинуть подлодку?')) {
        try {
            // Удалить игрока из списка
            await update(gameRef, {
                [`players/${currentUser.uid}`]: null,
                'currentPlayers': Math.max(0, (await get(gameRef)).val().currentPlayers - 1)
            });
            
            // Если игроков не осталось, удалить игру
            const snapshot = await get(gameRef);
            const game = snapshot.val();
            if (!game.players || Object.keys(game.players).length === 0) {
                await remove(gameRef);
            }
            
            // Очистить localStorage и вернуться на главную
            localStorage.removeItem('neocascade_room');
            localStorage.removeItem('neocascade_role');
            window.location.href = 'index.html';
            
        } catch (error) {
            console.error('Ошибка при выходе:', error);
            alert('Ошибка при выходе из игры');
        }
    }
});

// Автоматическое движение к цели
function simulateMovement(game) {
    const location = game.submarine.location;
    const target = game.submarine.target;
    const speed = game.submarine.speed;
    
    // Рассчитать направление
    const dx = target.x - location.x;
    const dy = target.y - location.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance > 0.1 && speed > 0) {
        // Двигаться к цели
        const moveDistance = speed * 0.01; // Скорость движения
        const ratio = moveDistance / distance;
        
        const newX = location.x + dx * ratio;
        const newY = location.y + dy * ratio;
        
        // Обновить позицию
        updateGameData({
            'submarine/location/x': newX,
            'submarine/location/y': newY
        });
        
        // Потребление кислорода и энергии
        updateGameData({
            'submarine/oxygen': Math.max(0, game.submarine.oxygen - 0.01),
            'submarine/power': Math.max(0, game.submarine.power - 0.02)
        });
    }
}

// Очистка при закрытии
window.addEventListener('beforeunload', () => {
    if (playersListener) playersListener();
    if (submarineListener) submarineListener();
});

// Запустить игру
init();
