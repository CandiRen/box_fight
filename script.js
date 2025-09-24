const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// --- DOM Elements ---
const startMenu = document.getElementById('startMenu');
const blueTeamCountInput = document.getElementById('blueTeamCount');
const redTeamCountInput = document.getElementById('redTeamCount');
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

let boxes = [];
let projectiles = [];
let gameOver = false;

// --- Classes ---
class Box {
    constructor(x, y, team) {
        this.x = x;
        this.y = y;
        this.width = BOX_SIZE;
        this.height = BOX_SIZE;
        this.team = team;
        this.color = team === 'blue' ? '#3498db' : '#e74c3c';
        this.hp = HP_MAX;
        this.target = null;
        this.fireCooldown = Math.random() * FIRE_RATE;

        // Random initial velocity
        const angle = Math.random() * 2 * Math.PI;
        this.dx = Math.cos(angle) * BOX_SPEED;
        this.dy = Math.sin(angle) * BOX_SPEED;
    }

    draw() {
        // Draw the box
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.width, this.height);

        // Draw HP bar
        const hpBarWidth = (this.hp / HP_MAX) * this.width;
        ctx.fillStyle = '#2ecc71'; // Green for HP
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

        // Wall bouncing logic with position correction to prevent getting stuck
        if (this.x <= 0) {
            this.x = 0;
            this.dx = -this.dx;
        } else if (this.x + this.width >= canvas.width) {
            this.x = canvas.width - this.width;
            this.dx = -this.dx;
        }

        if (this.y <= 0) {
            this.y = 0;
            this.dy = -this.dy;
        } else if (this.y + this.height >= canvas.height) {
            this.y = canvas.height - this.height;
            this.dy = -this.dy;
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
            const projectile = new Projectile(
                this.x + this.width / 2,
                this.y + this.height / 2,
                angle,
                this.team
            );
            projectiles.push(projectile);
            this.fireCooldown = FIRE_RATE;
        }
    }
}

class Projectile {
    constructor(x, y, angle, team) {
        this.x = x;
        this.y = y;
        this.width = PROJECTILE_SIZE;
        this.height = PROJECTILE_SIZE;
        this.team = team;
        this.color = '#f1c40f'; // Yellow
        this.dx = Math.cos(angle) * PROJECTILE_SPEED;
        this.dy = Math.sin(angle) * PROJECTILE_SPEED;
    }

    draw() {
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x - this.width / 2, this.y - this.height / 2, this.width, this.height);
    }

    update() {
        this.x += this.dx;
        this.y += this.dy;
    }
}

// --- Game Logic ---
function init(blueCount, redCount) {
    boxes = [];
    projectiles = [];
    gameOver = false;
    
    // Create blue team on the left
    for (let i = 0; i < blueCount; i++) {
        const x = Math.random() * (canvas.width / 4);
        const y = Math.random() * canvas.height;
        boxes.push(new Box(x, y, 'blue'));
    }

    // Create red team on the right
    for (let i = 0; i < redCount; i++) {
        const x = canvas.width - (Math.random() * (canvas.width / 4));
        const y = Math.random() * canvas.height;
        boxes.push(new Box(x, y, 'red'));
    }
    
    // Start the game loop
    animate();
}

function checkCollisions() {
    for (let i = projectiles.length - 1; i >= 0; i--) {
        const p = projectiles[i];
        for (let j = boxes.length - 1; j >= 0; j--) {
            const b = boxes[j];

            if (p.team !== b.team &&
                p.x > b.x &&
                p.x < b.x + b.width &&
                p.y > b.y &&
                p.y < b.y + b.height)
            {
                b.hp -= PROJECTILE_DAMAGE;
                projectiles.splice(i, 1); // Remove projectile

                if (b.hp <= 0) {
                    boxes.splice(j, 1); // Remove box
                }
                break; 
            }
        }
    }
}

function checkGameOver() {
    const redTeamCount = boxes.filter(b => b.team === 'red').length;
    const blueTeamCount = boxes.filter(b => b.team === 'blue').length;

    if (redTeamCount === 0 || blueTeamCount === 0) {
        gameOver = true;
        const winner = redTeamCount === 0 ? 'Blue Team' : 'Red Team';
        setTimeout(() => displayWinner(winner), 1000); // Wait a second before showing winner
    }
}

function displayWinner(winner) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = 'white';
    ctx.font = '60px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Game Over', canvas.width / 2, canvas.height / 2 - 60);
    
    ctx.fillStyle = winner === 'Blue Team' ? '#3498db' : '#e74c3c';
    ctx.font = '40px sans-serif';
    ctx.fillText(`${winner} Wins!`, canvas.width / 2, canvas.height / 2);

    ctx.fillStyle = '#ecf0f1';
    ctx.font = '20px sans-serif';
    ctx.fillText('Click anywhere to Play Again', canvas.width / 2, canvas.height / 2 + 50);
}

function animate() {
    if (gameOver) return;

    requestAnimationFrame(animate);
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    boxes.forEach(box => {
        box.update();
        box.draw();
    });

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
}

function startGame() {
    const blueCount = parseInt(blueTeamCountInput.value, 10);
    const redCount = parseInt(redTeamCountInput.value, 10);

    startMenu.classList.add('hidden');
    canvas.classList.remove('hidden');

    init(blueCount, redCount);
}

// --- Event Listeners ---
startButton.addEventListener('click', startGame);
canvas.addEventListener('click', () => {
    if (gameOver) {
        showMenu();
    }
});