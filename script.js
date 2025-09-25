const canvas = document.getElementById('gameCanvas');
canvas.width = 800;
canvas.height = 600;
const ctx = canvas.getContext('2d');

// --- DOM Elements ---
const modeMenu = document.getElementById('modeMenu');
const classicModeButton = document.getElementById('classicModeButton');
const powerupModeButton = document.getElementById('powerupModeButton');
const battleSetupMenu = document.getElementById('battleSetupMenu');
const teamsConfigDiv = document.getElementById('teamsConfig');
const addTeamButton = document.getElementById('addTeamButton');
const arenaSelect = document.getElementById('arenaSelect');
const startButton = document.getElementById('startButton');
const backToModeSelectButton = document.getElementById('backToModeSelectButton');
const battleInfo = document.getElementById('battleInfo');
const escapeMenu = document.getElementById('escapeMenu');
const rematchButton = document.getElementById('rematchButton');
const mainMenuButton = document.getElementById('mainMenuButton');
const powerUpSelection = document.getElementById('powerUpSelection');
const powerUpOptionsDiv = powerUpSelection.querySelector('.powerup-options');
const speedControl = document.getElementById('speedControl');
const speedValue = document.getElementById('speedValue');

// --- Game Settings ---
const BOX_SIZE = 20;
const BASE_BOX_SPEED = 1.5;
const HP_MAX = 100;
const PROJECTILE_SPEED = 4;
const PROJECTILE_SIZE = 5;
const BASE_PROJECTILE_DAMAGE = 10;
const BASE_FIRE_RATE = 60; // Lower is faster

// --- Power-up Settings ---
const POWERUP_SPAWN_INTERVAL = 480; // frames, e.g., every 8 seconds
const POWERUP_DURATION = 420; // frames, e.g., 7 seconds
const POWERUP_TYPES = {
    HEAL: { color: '#2ecc71', symbol: '+' },
    DAMAGE: { color: '#e74c3c', symbol: 'D' },
    FIRE_RATE: { color: '#3498db', symbol: 'F' },
    HOMING_SHOT: { color: '#f1c40f', symbol: 'H' },
    SPEED_BOOST: { color: '#9b59b6', symbol: 'S' },
    TRIPLE_SHOT: { color: '#1abc9c', symbol: 'T' }
};

// --- Arena Layouts ---
const ARENA_LAYOUTS = {
    empty: [],
    center_pillar: [ { x: canvas.width / 2 - 50, y: canvas.height / 2 - 50, width: 100, height: 100 } ],
    simple_maze: [ { x: 150, y: 0, width: 30, height: 400 }, { x: canvas.width - 180, y: canvas.height - 400, width: 30, height: 400 } ],
    fortress: [ { x: 150, y: 150, width: 30, height: 100 }, { x: 150, y: 350, width: 30, height: 100 }, { x: canvas.width - 180, y: 150, width: 30, height: 100 }, { x: canvas.width - 180, y: 350, width: 30, height: 100 }, ],
    two_pillars: [ { x: canvas.width / 3, y: 100, width: 30, height: 400 }, { x: (canvas.width / 3) * 2 - 30, y: 100, width: 30, height: 400 }, ],
    asteroid_field: [ { x: 200, y: 100, width: 40, height: 40 }, { x: 560, y: 460, width: 40, height: 40 }, { x: 380, y: 300, width: 40, height: 40 }, { x: 150, y: 450, width: 40, height: 40 }, { x: 600, y: 120, width: 40, height: 40 }, { x: 300, y: 500, width: 40, height: 40 }, { x: 500, y: 250, width: 40, height: 40 }, { x: 250, y: 250, width: 40, height: 40 }, { x: 550, y: 350, width: 40, height: 40 }, ]
};

// --- Game State ---
let boxes = [], projectiles = [], obstacles = [], powerUps = [];
let gameOver = false, isPaused = false, gameSpeed = 1.0;
let teamIdCounter = 0, powerUpSpawnCounter = 0;
let activeTeams = [], currentArenaName, currentGameMode = 'classic';
let selectedPowerUpTypes = []; // New global for selected power-ups
let animationFrameId;

// --- Utility ---
function lightenColor(hex, percent) {
    hex = hex.replace(/^#/, '');
    const r = parseInt(hex.substring(0, 2), 16), g = parseInt(hex.substring(2, 4), 16), b = parseInt(hex.substring(4, 6), 16);
    const newR = Math.min(255, r + (255 - r) * (percent / 100));
    const newG = Math.min(255, g + (255 - g) * (percent / 100));
    const newB = Math.min(255, b + (255 - b) * (percent / 100));
    return `rgb(${Math.round(newR)}, ${Math.round(newG)}, ${Math.round(newB)})`;
}

// --- Classes ---
class PowerUp {
    constructor(x, y, type) {
        this.x = x; this.y = y; this.type = type; this.size = 15;
        this.color = POWERUP_TYPES[type].color; this.symbol = POWERUP_TYPES[type].symbol;
    }
    draw() {
        ctx.save();
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x + this.size / 2, this.y + this.size / 2, this.size / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'white'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
        ctx.textBaseline = 'middle'; ctx.fillText(this.symbol, this.x + this.size / 2, this.y + this.size / 2 + 1);
        ctx.restore();
    }
}

class Box {
    constructor(x, y, teamId, color, teamName, side) {
        this.x = x; this.y = y; this.width = BOX_SIZE; this.height = BOX_SIZE;
        this.team = teamId; this.color = color; this.teamName = teamName; this.hp = HP_MAX;
        this.side = side;
        this.target = null; this.fireCooldown = Math.random() * BASE_FIRE_RATE;
        const angle = Math.random() * 2 * Math.PI;
        this.dx = Math.cos(angle) * BASE_BOX_SPEED; this.dy = Math.sin(angle) * BASE_BOX_SPEED; // Initial speed

        // Power-up related stats
        this.powerUpTimers = {}; // e.g., { DAMAGE: 300, FIRE_RATE: 300, HOMING_SHOT: 300, SPEED_BOOST: 300, TRIPLE_SHOT: 300 }
    }

    getCurrentDamage() {
        return this.powerUpTimers.DAMAGE > 0 ? BASE_PROJECTILE_DAMAGE * 1.5 : BASE_PROJECTILE_DAMAGE;
    }

    getCurrentFireRate() {
        return this.powerUpTimers.FIRE_RATE > 0 ? BASE_FIRE_RATE / 2 : BASE_FIRE_RATE;
    }

    getCurrentSpeedMultiplier() {
        return this.powerUpTimers.SPEED_BOOST > 0 ? 1.5 : 1;
    }

    isHomingShotActive() {
        return this.powerUpTimers.HOMING_SHOT > 0;
    }

    isTripleShotActive() {
        return this.powerUpTimers.TRIPLE_SHOT > 0;
    }

    updatePowerUps() {
        for (const type in this.powerUpTimers) {
            if (this.powerUpTimers[type] > 0) {
                this.powerUpTimers[type] -= gameSpeed;
            }
        }
    }

    draw() {
        ctx.fillStyle = this.color;
        // Visual cues for power-ups
        if (this.powerUpTimers.DAMAGE > 0) ctx.fillStyle = '#fffa65'; // Yellowish for damage
        if (this.powerUpTimers.SPEED_BOOST > 0) ctx.fillStyle = '#9b59b6'; // Purple for speed
        if (this.powerUpTimers.TRIPLE_SHOT > 0) ctx.strokeStyle = '#1abc9c'; else ctx.strokeStyle = this.color; // Teal border for triple
        if (this.powerUpTimers.HOMING_SHOT > 0) ctx.strokeStyle = '#f1c40f'; else ctx.strokeStyle = this.color; // Yellow border for homing

        ctx.lineWidth = (this.powerUpTimers.TRIPLE_SHOT > 0 || this.powerUpTimers.HOMING_SHOT > 0) ? 3 : 1;
        ctx.fillRect(this.x, this.y, this.width, this.height);
        ctx.strokeRect(this.x, this.y, this.width, this.height);
        ctx.lineWidth = 1;

        const hpBarWidth = (this.hp / HP_MAX) * this.width;
        ctx.fillStyle = '#2ecc71';
        ctx.fillRect(this.x, this.y - 7, hpBarWidth, 5);
        ctx.strokeStyle = '#ecf0f1';
        ctx.strokeRect(this.x, this.y - 7, this.width, 5);
    }

    update() {
        this.move();
        this.findTarget();
        this.shoot();
        if(currentGameMode === 'powerup') this.updatePowerUps();
    }

    move() {
        const currentSpeedMultiplier = this.getCurrentSpeedMultiplier();
        this.x += this.dx * currentSpeedMultiplier * gameSpeed;
        this.y += this.dy * currentSpeedMultiplier * gameSpeed;

        if (this.x <= 0) { this.x = 0; this.dx = -this.dx; } 
        else if (this.x + this.width >= canvas.width) { this.x = canvas.width - this.width; this.dx = -this.dx; }
        if (this.y <= 0) { this.y = 0; this.dy = -this.dy; } 
        else if (this.y + this.height >= canvas.height) { this.y = canvas.height - this.height; this.dy = -this.dy; }

        for (const obs of obstacles) {
            if (this.x < obs.x + obs.width && this.x + this.width > obs.x && this.y < obs.y + obs.height && this.y + this.height > obs.y) {
                const penX = (this.width / 2 + obs.width / 2) - Math.abs((this.x + this.width / 2) - (obs.x + obs.width / 2));
                const penY = (this.height / 2 + obs.height / 2) - Math.abs((this.y + this.height / 2) - (obs.y + obs.height / 2));
                if (penX < penY) {
                    if ((this.x + this.width / 2) < (obs.x + obs.width / 2)) { this.x = obs.x - this.width; } else { this.x = obs.x + obs.width; }
                    this.dx = -this.dx;
                } else {
                    if ((this.y + this.height / 2) < (obs.y + obs.height / 2)) { this.y = obs.y - this.height; } else { this.y = obs.y + obs.height; }
                    this.dy = -this.dy;
                }
            }
        }
    }

    findTarget() {
        let closestEnemy = null, minDistance = Infinity;
        for (const otherBox of boxes) {
            if (otherBox.side !== this.side) {
                const distance = Math.hypot(this.x - otherBox.x, this.y - otherBox.y);
                if (distance < minDistance) { minDistance = distance; closestEnemy = otherBox; }
            }
        }
        this.target = closestEnemy;
    }

    shoot() {
        this.fireCooldown -= gameSpeed;
        if (this.target && this.fireCooldown <= 0) {
            const baseAngle = Math.atan2(this.target.y - this.y, this.target.x - this.x);
            const isTripleShot = this.isTripleShotActive();
            const isHomingShot = this.isHomingShotActive();

            const shootProjectile = (angleOffset) => {
                const angle = baseAngle + angleOffset;
                const p = new Projectile(
                    this.x + this.width / 2,
                    this.y + this.height / 2,
                    angle,
                    this.team,
                    this.color,
                    this.getCurrentDamage(),
                    isHomingShot,
                    this.target, // Pass the target box for homing
                    this.side
                );
                projectiles.push(p);
            };

            if (isTripleShot) {
                shootProjectile(-0.2); // Slightly left
                shootProjectile(0);    // Center
                shootProjectile(0.2);  // Slightly right
            } else {
                shootProjectile(0); // Single shot
            }
            this.fireCooldown = this.getCurrentFireRate();
        }
    }
}

class Projectile {
    constructor(x, y, angle, team, teamColor, damage, isHoming = false, targetBox = null, side) {
        this.x = x; this.y = y;
        this.width = PROJECTILE_SIZE; this.height = PROJECTILE_SIZE;
        this.team = team;
        this.side = side;
        this.color = lightenColor(teamColor, 50);
        this.dx = Math.cos(angle) * PROJECTILE_SPEED;
        this.dy = Math.sin(angle) * PROJECTILE_SPEED;
        this.damage = damage;
        this.isHoming = isHoming;
        this.targetBox = targetBox;
        this.turnRate = 0.05; // How quickly it can turn
    }
    draw() { ctx.fillStyle = this.color; ctx.fillRect(this.x - this.width / 2, this.y - this.height / 2, this.width, this.height); }
    update() {
        if (this.isHoming && this.targetBox && this.targetBox.hp > 0) { 
            const targetAngle = Math.atan2(this.targetBox.y - this.y, this.targetBox.x - this.x);
            let currentAngle = Math.atan2(this.dy, this.dx);
            let angleDiff = targetAngle - currentAngle;

            if (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
            if (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

            currentAngle += Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), this.turnRate * gameSpeed);

            this.dx = Math.cos(currentAngle) * PROJECTILE_SPEED;
            this.dy = Math.sin(currentAngle) * PROJECTILE_SPEED;
        }
        this.x += this.dx * gameSpeed;
        this.y += this.dy * gameSpeed;
    }
}

// --- Game Logic ---
function init(teams, arenaName, mode, powerUpTypesToSpawn) {
    currentArenaName = arenaName; currentGameMode = mode; gameOver = false;
    boxes = []; projectiles = []; powerUps = []; powerUpSpawnCounter = 0;
    selectedPowerUpTypes = powerUpTypesToSpawn; // Store selected power-ups
    obstacles = ARENA_LAYOUTS[arenaName].map(o => ({ ...o }));
    const teamCount = teams.length, angleIncrement = (2 * Math.PI) / teamCount, spawnRadius = Math.min(canvas.width, canvas.height) / 3;
    teams.forEach((team, index) => {
        const angle = index * angleIncrement, spawnCenterX = canvas.width / 2 + spawnRadius * Math.cos(angle), spawnCenterY = canvas.height / 2 + spawnRadius * Math.sin(angle), spawnArea = 100;
        for (let i = 0; i < team.count; i++) {
            let x, y, validPos;
            do {
                validPos = true;
                x = spawnCenterX + (Math.random() - 0.5) * spawnArea; y = spawnCenterY + (Math.random() - 0.5) * spawnArea;
                x = Math.max(BOX_SIZE, Math.min(canvas.width - BOX_SIZE, x)); y = Math.max(BOX_SIZE, Math.min(canvas.height - BOX_SIZE, y));
                for (const obs of obstacles) { if (x < obs.x + obs.width && x + BOX_SIZE > obs.x && y < obs.y + obs.height && y + BOX_SIZE > obs.y) { validPos = false; break; } }
            } while (!validPos);
            boxes.push(new Box(x, y, team.id, team.color, team.name, team.side));
        }
    });
    animate();
}

function animate() {
    if (gameOver) return;
    animationFrameId = requestAnimationFrame(animate);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawObstacles();
    if (currentGameMode === 'powerup') {
        powerUps.forEach(p => p.draw());
        powerUpSpawnCounter += gameSpeed;
        if (powerUpSpawnCounter >= POWERUP_SPAWN_INTERVAL) {
            spawnRandomPowerUp();
            powerUpSpawnCounter = 0;
        }
    }
    boxes.forEach(box => { box.update(); box.draw(); });
    projectiles.forEach((p, index) => { p.update(); p.draw(); if (p.x < 0 || p.x > canvas.width || p.y < 0 || p.y > canvas.height) { projectiles.splice(index, 1); } });
    checkCollisions(); checkGameOver();
}

function drawObstacles() { ctx.fillStyle = '#8395a7'; for (const obs of obstacles) { ctx.fillRect(obs.x, obs.y, obs.width, obs.height); } }

function spawnRandomPowerUp() {
    if (selectedPowerUpTypes.length === 0) return; // Don't spawn if no power-ups are selected

    const type = selectedPowerUpTypes[Math.floor(Math.random() * selectedPowerUpTypes.length)];
    let x, y, validPos;
    do {
        validPos = true;
        x = Math.random() * (canvas.width - 20) + 10; y = Math.random() * (canvas.height - 20) + 10;
        for (const obs of obstacles) { if (x < obs.x + obs.width && x + 15 > obs.x && y < obs.y + obs.height && y + 15 > obs.y) { validPos = false; break; } }
    } while (!validPos);
    powerUps.push(new PowerUp(x, y, type));
}

function checkCollisions() { 
    // Projectiles vs Boxes & Obstacles
    for (let i = projectiles.length - 1; i >= 0; i--) { 
        const p = projectiles[i]; let projectileRemoved = false; 
        for (let j = boxes.length - 1; j >= 0; j--) { 
            const b = boxes[j]; 
            if (p.side !== b.side && p.x > b.x && p.x < b.x + b.width && p.y > b.y && p.y < b.y + b.height) { 
                b.hp -= p.damage; projectiles.splice(i, 1); projectileRemoved = true; 
                if (b.hp <= 0) { boxes.splice(j, 1); } break; 
            } 
        } 
        if (projectileRemoved) continue; 
        for (const obs of obstacles) { 
            if (p.x > obs.x && p.x < obs.x + obs.width && p.y > obs.y && p.y < obs.y + obs.height) { 
                projectiles.splice(i, 1); break; 
            } 
        } 
    } 
    // Boxes vs Power-ups
    if (currentGameMode === 'powerup') { 
        for (let i = powerUps.length - 1; i >= 0; i--) { 
            const pu = powerUps[i]; 
            for (const b of boxes) { 
                if (b.x < pu.x + pu.size && b.x + b.width > pu.x && b.y < pu.y + pu.size && b.y + b.height > pu.y) { 
                    applyPowerUp(b, pu); powerUps.splice(i, 1); break; 
                } 
            } 
        } 
    } 
    // Box to Box collisions (only if HP < 100)
    for (let i = 0; i < boxes.length; i++) {
        const b1 = boxes[i];
        for (let j = i + 1; j < boxes.length; j++) { // Avoid self-collision and duplicate checks
            const b2 = boxes[j];
            if (b1.hp < HP_MAX && b2.hp < HP_MAX) {
                if (b1.x < b2.x + b2.width && b1.x + b1.width > b2.x && b1.y < b2.y + b2.height && b1.y + b1.height > b2.y) {
                    b1.dx = -b1.dx; b1.dy = -b1.dy; b2.dx = -b2.dx; b2.dy = -b2.dy;
                    const overlapX = (b1.width / 2 + b2.width / 2) - Math.abs((b1.x + b1.width / 2) - (b2.x + b2.width / 2));
                    const overlapY = (b1.height / 2 + b2.height / 2) - Math.abs((b1.y + b1.height / 2) - (b2.y + b2.height / 2));
                    if (overlapX < overlapY) { if ((b1.x + b1.width / 2) < (b2.x + b2.width / 2)) { b1.x -= overlapX / 2; b2.x += overlapX / 2; } else { b1.x += overlapX / 2; b2.x -= overlapX / 2; } } 
                    else { if ((b1.y + b1.height / 2) < (b2.y + b2.height / 2)) { b1.y -= overlapY / 2; b2.y += overlapY / 2; } else { b1.y += overlapY / 2; b2.y -= overlapY / 2; } }
                }
            }
        }
    }
}

function applyPowerUp(box, powerUp) { 
    switch (powerUp.type) {
        case 'HEAL': box.hp = Math.min(HP_MAX, box.hp + 50); break;
        case 'DAMAGE': box.powerUpTimers.DAMAGE = POWERUP_DURATION; break;
        case 'FIRE_RATE': box.powerUpTimers.FIRE_RATE = POWERUP_DURATION; break;
        case 'HOMING_SHOT': box.powerUpTimers.HOMING_SHOT = POWERUP_DURATION; break;
        case 'SPEED_BOOST': box.powerUpTimers.SPEED_BOOST = POWERUP_DURATION; break;
        case 'TRIPLE_SHOT': box.powerUpTimers.TRIPLE_SHOT = POWERUP_DURATION; break;
    }
}

function checkGameOver() { if (boxes.length === 0) { gameOver = true; setTimeout(() => displayWinner(null), 1000); return; } const remainingSideIds = new Set(boxes.map(b => b.side)); if (remainingSideIds.size <= 1) { gameOver = true; const winnerSideId = remainingSideIds.values().next().value; const winningTeams = activeTeams.filter(t => t.side === winnerSideId); setTimeout(() => displayWinner(winningTeams), 1000); } }

function displayWinner(winner) { // winner is now winningTeams (an array) or null
    cancelAnimationFrame(animationFrameId);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'white';
    ctx.font = '60px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Game Over', canvas.width / 2, canvas.height / 2 - 60);
    if (winner && winner.length > 0) {
        const winnerSideId = winner[0].side;
        ctx.font = '40px sans-serif';
        ctx.fillText(`Side ${winnerSideId} Wins!`, canvas.width / 2, canvas.height / 2);
        const teamNames = winner.map(t => t.name).join(', ');
        ctx.font = '20px sans-serif';
        ctx.fillText(teamNames, canvas.width / 2, canvas.height / 2 + 30);
    } else {
        ctx.fillStyle = '#ecf0f1';
        ctx.font = '40px sans-serif';
        ctx.fillText('It\'s a Draw!', canvas.width / 2, canvas.height / 2);
    }
    ctx.fillStyle = '#ecf0f1';
    ctx.font = '20px sans-serif';
    ctx.fillText('Click anywhere to Play Again', canvas.width / 2, canvas.height / 2 + 80);
}

// --- UI & Menu Management ---
function showModeMenu() {
    cancelAnimationFrame(animationFrameId);
    isPaused = false;
    modeMenu.classList.remove('hidden');
    battleSetupMenu.classList.add('hidden');
    canvas.classList.add('hidden');
    battleInfo.classList.add('hidden');
    escapeMenu.classList.add('hidden');
    speedControl.classList.add('hidden');
}

function showBattleSetup(mode) {
    currentGameMode = mode;
    modeMenu.classList.add('hidden');
    battleSetupMenu.classList.remove('hidden');
    
    // Show/hide power-up selection based on mode
    if (mode === 'powerup') {
        powerUpSelection.classList.remove('hidden');
        populatePowerUpOptions(); // Generate checkboxes
    } else {
        powerUpSelection.classList.add('hidden');
    }

    // Setup team configuration UI
    teamsConfigDiv.innerHTML = '';
    teamIdCounter = 0;
    addTeamRow('#3498db', 7, 1);
    addTeamRow('#e74c3c', 7, 2);
}

function populatePowerUpOptions() {
    powerUpOptionsDiv.innerHTML = ''; // Clear previous options
    for (const type in POWERUP_TYPES) {
        const label = document.createElement('label');
        label.innerHTML = `<input type="checkbox" value="${type}" checked> ${POWERUP_TYPES[type].symbol} ${type.replace('_', ' ').toLowerCase().split(' ').map(s => s.charAt(0).toUpperCase() + s.substring(1)).join(' ')}`;
        powerUpOptionsDiv.appendChild(label);
    }
}

function getRandomColor() {
    const letters = '0123456789ABCDEF'; let color = '#';
    for (let i = 0; i < 6; i++) { color += letters[Math.floor(Math.random() * 16)]; }
    return color;
}

function addTeamRow(color, count = 7, side = 1) {
    teamIdCounter++;
    const teamRow = document.createElement('div');
    teamRow.classList.add('team-setup');
    teamRow.setAttribute('data-team-id', teamIdCounter);
    teamRow.innerHTML = `
        <input type="text" class="team-name" value="Team ${teamIdCounter}" placeholder="Nama Tim">
        <input type="color" value="${color}">
        <input type="number" value="${count}" min="1" max="50">
        <select class="side-select">
            <option value="1">Side 1</option>
            <option value="2">Side 2</option>
            <option value="3">Side 3</option>
            <option value="4">Side 4</option>
        </select>
        <button type="button" class="remove-team-btn">&#x1F5D1;</button>
    `;
    teamRow.querySelector('.side-select').value = side;
    teamsConfigDiv.appendChild(teamRow);
}

function startGame() {
    const teamRows = teamsConfigDiv.querySelectorAll('.team-setup');
    if (teamRows.length < 2) { alert("You need at least two teams to start a battle."); return; }

    const teams = [];
    teamRows.forEach(row => {
        const id = parseInt(row.getAttribute('data-team-id'), 10);
        const name = row.querySelector('.team-name').value || `Team ${id}`;
        const color = row.querySelector('input[type="color"]').value;
        const count = parseInt(row.querySelector('input[type="number"]').value, 10);
        const side = parseInt(row.querySelector('.side-select').value, 10);
        if (count > 0) { teams.push({ id, name, color, count, side }); }
    });

    const arenaName = arenaSelect.value;
    
    // Read selected power-up types
    if (currentGameMode === 'powerup') {
        selectedPowerUpTypes = Array.from(powerUpOptionsDiv.querySelectorAll('input[type="checkbox"]'))
                                .filter(checkbox => checkbox.checked)
                                .map(checkbox => checkbox.value);
        if (selectedPowerUpTypes.length === 0) {
            alert("Please select at least one power-up type for Power-up Mode.");
            return;
        }
    } else {
        selectedPowerUpTypes = []; // Clear for classic mode
    }

    activeTeams = teams;
    currentArenaName = arenaName;

    const infoBySide = activeTeams.reduce((acc, team) => {
        if (!acc[team.side]) {
            acc[team.side] = [];
        }
        acc[team.side].push(`<span style="color: ${team.color};">${team.count} ${team.name}</span>`);
        return acc;
    }, {});

    const infoHtml = Object.values(infoBySide).map(sideTeams => sideTeams.join(' + ')).join(' <span class="vs-separator">VS</span> ');
    battleInfo.innerHTML = infoHtml;

    battleSetupMenu.classList.add('hidden');
    canvas.classList.remove('hidden');
    battleInfo.classList.remove('hidden');
    speedControl.classList.remove('hidden');
    gameSpeed = 1.0;
    speedValue.textContent = '1.0x';

    init(teams, arenaName, currentGameMode, selectedPowerUpTypes);
}

// --- Pause & Menu Logic ---
function togglePause(force) {
    if (gameOver) return;
    isPaused = force !== undefined ? force : !isPaused;
    if (isPaused) {
        cancelAnimationFrame(animationFrameId);
        escapeMenu.classList.remove('hidden');
    } else {
        escapeMenu.classList.add('hidden');
        cancelAnimationFrame(animationFrameId);
        animate();
    }
}

// --- Event Listeners ---
classicModeButton.addEventListener('click', () => showBattleSetup('classic'));
powerupModeButton.addEventListener('click', () => showBattleSetup('powerup'));
backToModeSelectButton.addEventListener('click', showModeMenu);
startButton.addEventListener('click', startGame);
canvas.addEventListener('click', () => { if (gameOver) { showModeMenu(); } });

window.addEventListener('keydown', (e) => {
    if (battleSetupMenu.classList.contains('hidden') && modeMenu.classList.contains('hidden')) {
        if (e.code === 'Space') { e.preventDefault(); if (!gameOver) { togglePause(); } }
        if (e.code === 'Escape') { e.preventDefault(); if (!gameOver) { togglePause(true); } }
        if (e.code === 'ArrowRight') {
            e.preventDefault();
            if (!isPaused) {
                gameSpeed = Math.min(gameSpeed + 0.1, 5.0); // Max speed 5x
                speedValue.textContent = `${gameSpeed.toFixed(1)}x`;
            }
        }
        if (e.code === 'ArrowLeft') {
            e.preventDefault();
            if (!isPaused) {
                gameSpeed = Math.max(gameSpeed - 0.1, 0.1); // Min speed 0.1x
                speedValue.textContent = `${gameSpeed.toFixed(1)}x`;
            }
        }
    }
});

rematchButton.addEventListener('click', () => {
    escapeMenu.classList.add('hidden');
    isPaused = false;
    init(activeTeams, currentArenaName, currentGameMode, selectedPowerUpTypes);
});

mainMenuButton.addEventListener('click', showModeMenu);
addTeamButton.addEventListener('click', () => addTeamRow(getRandomColor(), 7, 1));
teamsConfigDiv.addEventListener('click', (e) => {
    if (e.target.classList.contains('remove-team-btn')) {
        if (teamsConfigDiv.children.length > 2) { e.target.parentElement.remove(); } 
        else { alert("You need at least two teams to start a battle."); }
    }
});

// --- Initial Setup ---
showModeMenu();