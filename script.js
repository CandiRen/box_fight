const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// --- DOM Elements ---
const startMenu = document.getElementById('startMenu');
const teamsConfigDiv = document.getElementById('teamsConfig');
const addTeamButton = document.getElementById('addTeamButton');
const arenaSelect = document.getElementById('arenaSelect');
const startButton = document.getElementById('startButton');

// Setup canvas dimensions
canvas.width = 800;
canvas.height = 600;

// --- Game Settings ---
const BOX_SIZE = 20;
const BOX_SPEED = 1.5;
const HP_MAX = 100;
const PROJECTILE_SPEED = 4;
const PROJECTILE_SIZE = 5;
const PROJECTILE_DAMAGE = 10;
const FIRE_RATE = 60; // Lower is faster, 1 shot every 60 frames

// --- Arena Layouts ---
const ARENA_LAYOUTS = {
    empty: [],
    center_pillar: [
        { x: canvas.width / 2 - 50, y: canvas.height / 2 - 50, width: 100, height: 100 }
    ],
    simple_maze: [
        { x: 150, y: 0, width: 30, height: 400 },
        { x: canvas.width - 180, y: canvas.height - 400, width: 30, height: 400 }
    ],
    fortress: [
        // Blue Base barriers (more open design)
        { x: 150, y: 150, width: 30, height: 100 },
        { x: 150, y: 350, width: 30, height: 100 },
        // Red Base barriers (more open design)
        { x: canvas.width - 180, y: 150, width: 30, height: 100 },
        { x: canvas.width - 180, y: 350, width: 30, height: 100 },
    ],
    two_pillars: [
        { x: canvas.width / 3, y: 100, width: 30, height: 400 },
        { x: (canvas.width / 3) * 2 - 30, y: 100, width: 30, height: 400 },
    ],
    asteroid_field: [
        { x: 200, y: 100, width: 40, height: 40 },
        { x: 560, y: 460, width: 40, height: 40 },
        { x: 380, y: 300, width: 40, height: 40 },
        { x: 150, y: 450, width: 40, height: 40 },
        { x: 600, y: 120, width: 40, height: 40 },
        { x: 300, y: 500, width: 40, height: 40 },
        { x: 500, y: 250, width: 40, height: 40 },
        { x: 250, y: 250, width: 40, height: 40 },
        { x: 550, y: 350, width: 40, height: 40 },
    ]
};

let boxes = [];
let projectiles = [];
let obstacles = [];
let gameOver = false;
let teamIdCounter = 0;
let activeTeams = []; // To store details of teams in the current game

// --- Team Management UI ---
function getRandomColor() {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
}

function addTeamRow(color, count = 7) {
    teamIdCounter++;
    const teamRow = document.createElement('div');
    teamRow.classList.add('team-setup');
    teamRow.setAttribute('data-team-id', teamIdCounter);
    teamRow.innerHTML = `
        <label>Team ${teamIdCounter}</label>
        <input type="color" value="${color}">
        <input type="number" value="${count}" min="1" max="50">
        <button type="button" class="remove-team-btn">Remove</button>
    `;
    teamsConfigDiv.appendChild(teamRow);
}

addTeamButton.addEventListener('click', () => {
    addTeamRow(getRandomColor(), 7);
});

teamsConfigDiv.addEventListener('click', (e) => {
    if (e.target.classList.contains('remove-team-btn')) {
        // Don't remove if only 2 teams are left
        if (teamsConfigDiv.children.length > 2) {
            e.target.parentElement.remove();
        } else {
            alert("You need at least two teams to start a battle.");
        }
    }
});

// --- Utility ---
function lightenColor(hex, percent) {
    hex = hex.replace(/^#/, '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);

    const newR = Math.min(255, r + (255 - r) * (percent / 100));
    const newG = Math.min(255, g + (255 - g) * (percent / 100));
    const newB = Math.min(255, b + (255 - b) * (percent / 100));

    return `rgb(${Math.round(newR)}, ${Math.round(newG)}, ${Math.round(newB)})`;
}


// --- Classes ---
class Box {
    constructor(x, y, teamId, color, teamName) {
        this.x = x;
        this.y = y;
        this.width = BOX_SIZE;
        this.height = BOX_SIZE;
        this.team = teamId;
        this.color = color;
        this.teamName = teamName;
        this.hp = HP_MAX;
        this.target = null;
        this.fireCooldown = Math.random() * FIRE_RATE;

        const angle = Math.random() * 2 * Math.PI;
        this.dx = Math.cos(angle) * BOX_SPEED;
        this.dy = Math.sin(angle) * BOX_SPEED;
    }

    draw() {
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.width, this.height);

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
    }

    move() {
        this.x += this.dx;
        this.y += this.dy;

        // Wall bouncing
        if (this.x <= 0) { this.x = 0; this.dx = -this.dx; }
        else if (this.x + this.width >= canvas.width) { this.x = canvas.width - this.width; this.dx = -this.dx; }
        if (this.y <= 0) { this.y = 0; this.dy = -this.dy; }
        else if (this.y + this.height >= canvas.height) { this.y = canvas.height - this.height; this.dy = -this.dy; }

        // Obstacle bouncing
        for (const obs of obstacles) {
            if (this.x < obs.x + obs.width && this.x + this.width > obs.x &&
                this.y < obs.y + obs.height && this.y + this.height > obs.y) {
                
                const penX = (this.width / 2 + obs.width / 2) - Math.abs((this.x + this.width / 2) - (obs.x + obs.width / 2));
                const penY = (this.height / 2 + obs.height / 2) - Math.abs((this.y + this.height / 2) - (obs.y + obs.height / 2));

                if (penX < penY) {
                    if ((this.x + this.width / 2) < (obs.x + obs.width / 2)) { this.x = obs.x - this.width; } 
                    else { this.x = obs.x + obs.width; }
                    this.dx = -this.dx;
                } else {
                    if ((this.y + this.height / 2) < (obs.y + obs.height / 2)) { this.y = obs.y - this.height; } 
                    else { this.y = obs.y + obs.height; }
                    this.dy = -this.dy;
                }
            }
        }
    }

    findTarget() {
        let closestEnemy = null;
        let minDistance = Infinity;
        for (const otherBox of boxes) {
            if (otherBox.team !== this.team) {
                const distance = Math.hypot(this.x - otherBox.x, this.y - otherBox.y);
                if (distance < minDistance) {
                    minDistance = distance;
                    closestEnemy = otherBox;
                }
            }
        }
        this.target = closestEnemy;
    }

    shoot() {
        this.fireCooldown--;
        if (this.target && this.fireCooldown <= 0) {
            const angle = Math.atan2(this.target.y - this.y, this.target.x - this.x);
            const p = new Projectile(this.x + this.width / 2, this.y + this.height / 2, angle, this.team, this.color);
            projectiles.push(p);
            this.fireCooldown = FIRE_RATE;
        }
    }
}

class Projectile {
    constructor(x, y, angle, team, teamColor) {
        this.x = x; this.y = y;
        this.width = PROJECTILE_SIZE; this.height = PROJECTILE_SIZE;
        this.team = team;
        this.color = lightenColor(teamColor, 50);
        this.dx = Math.cos(angle) * PROJECTILE_SPEED;
        this.dy = Math.sin(angle) * PROJECTILE_SPEED;
    }
    draw() { ctx.fillStyle = this.color; ctx.fillRect(this.x - this.width / 2, this.y - this.height / 2, this.width, this.height); }
    update() { this.x += this.dx; this.y += this.dy; }
}

// --- Game Logic ---
function init(teams, arenaName) {
    boxes = [];
    projectiles = [];
    activeTeams = teams; // Store for later
    obstacles = ARENA_LAYOUTS[arenaName].map(o => ({...o}));
    gameOver = false;
    
    const teamCount = teams.length;
    const angleIncrement = (2 * Math.PI) / teamCount;
    const spawnRadius = Math.min(canvas.width, canvas.height) / 3;

    teams.forEach((team, index) => {
        const angle = index * angleIncrement;
        const spawnCenterX = canvas.width / 2 + spawnRadius * Math.cos(angle);
        const spawnCenterY = canvas.height / 2 + spawnRadius * Math.sin(angle);
        const spawnArea = 100;

        for (let i = 0; i < team.count; i++) {
            let x, y, validPos;
            do {
                validPos = true;
                x = spawnCenterX + (Math.random() - 0.5) * spawnArea;
                y = spawnCenterY + (Math.random() - 0.5) * spawnArea;
                
                // Clamp to canvas bounds
                x = Math.max(BOX_SIZE, Math.min(canvas.width - BOX_SIZE, x));
                y = Math.max(BOX_SIZE, Math.min(canvas.height - BOX_SIZE, y));

                for(const obs of obstacles) {
                    if(x < obs.x + obs.width && x + BOX_SIZE > obs.x && y < obs.y + obs.height && y + BOX_SIZE > obs.y) {
                        validPos = false; break;
                    }
                }
            } while (!validPos);
            boxes.push(new Box(x, y, team.id, team.color, team.name));
        }
    });
    
    animate();
}

function drawObstacles() {
    ctx.fillStyle = '#8395a7';
    for (const obs of obstacles) {
        ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
    }
}

function checkCollisions() {
    for (let i = projectiles.length - 1; i >= 0; i--) {
        const p = projectiles[i];
        let projectileRemoved = false;

        for (let j = boxes.length - 1; j >= 0; j--) {
            const b = boxes[j];
            if (p.team !== b.team && p.x > b.x && p.x < b.x + b.width && p.y > b.y && p.y < b.y + b.height) {
                b.hp -= PROJECTILE_DAMAGE;
                projectiles.splice(i, 1);
                projectileRemoved = true;
                if (b.hp <= 0) { boxes.splice(j, 1); }
                break;
            }
        }

        if (projectileRemoved) continue;

        for (const obs of obstacles) {
            if (p.x > obs.x && p.x < obs.x + obs.width && p.y > obs.y && p.y < obs.y + obs.height) {
                projectiles.splice(i, 1);
                break;
            }
        }
    }
}

function checkGameOver() {
    if (boxes.length === 0) {
        gameOver = true;
        setTimeout(() => displayWinner(null), 1000); // Draw
        return;
    }

    const remainingTeamIds = new Set(boxes.map(b => b.team));
    if (remainingTeamIds.size <= 1) {
        gameOver = true;
        const winnerId = remainingTeamIds.values().next().value;
        const winner = activeTeams.find(t => t.id === winnerId);
        setTimeout(() => displayWinner(winner), 1000);
    }
}

function displayWinner(winner) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'white';
    ctx.font = '60px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Game Over', canvas.width / 2, canvas.height / 2 - 60);
    
    if (winner) {
        ctx.fillStyle = winner.color;
        ctx.font = '40px sans-serif';
        ctx.fillText(`${winner.name} Wins!`, canvas.width / 2, canvas.height / 2);
    } else {
        ctx.fillStyle = '#ecf0f1';
        ctx.font = '40px sans-serif';
        ctx.fillText('It\'s a Draw!', canvas.width / 2, canvas.height / 2);
    }

    ctx.fillStyle = '#ecf0f1';
    ctx.font = '20px sans-serif';
    ctx.fillText('Click anywhere to Play Again', canvas.width / 2, canvas.height / 2 + 50);
}

function animate() {
    if (gameOver) return;
    requestAnimationFrame(animate);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawObstacles();
    boxes.forEach(box => { box.update(); box.draw(); });
    projectiles.forEach((p, index) => {
        p.update();
        p.draw();
        if (p.x < 0 || p.x > canvas.width || p.y < 0 || p.y > canvas.height) {
            projectiles.splice(index, 1);
        }
    });
    checkCollisions();
    checkGameOver();
}

function showMenu() {
    startMenu.classList.remove('hidden');
    canvas.classList.add('hidden');
    // Re-create initial teams for the menu
    teamsConfigDiv.innerHTML = '';
    teamIdCounter = 0;
    addTeamRow('#3498db', 7);
    addTeamRow('#e74c3c', 7);
}

function startGame() {
    const teamRows = teamsConfigDiv.querySelectorAll('.team-setup');
    if (teamRows.length < 2) {
        alert("You need at least two teams to start a battle.");
        return;
    }

    const teams = [];
    teamRows.forEach(row => {
        const id = parseInt(row.getAttribute('data-team-id'), 10);
        const name = row.querySelector('label').textContent;
        const color = row.querySelector('input[type="color"]').value;
        const count = parseInt(row.querySelector('input[type="number"]').value, 10);
        if (count > 0) {
            teams.push({ id, name, color, count });
        }
    });

    const arenaName = arenaSelect.value;

    startMenu.classList.add('hidden');
    canvas.classList.remove('hidden');

    init(teams, arenaName);
}

// --- Event Listeners ---
startButton.addEventListener('click', startGame);
cvas.addEventListener('click', () => {
    if (gameOver) {
        showMenu();
    }
});

// --- Initial Setup ---
showMenu();