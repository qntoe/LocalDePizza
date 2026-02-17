import Phaser from 'phaser';

const TILE = 40, GW = 450, GH = 800;

export class ArenaScene extends Phaser.Scene {
    constructor() { super({ key: 'ArenaScene' }); }

    create() {
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        
        // --- 0. STATE ---
        this.moneyInPocket = 0; 
        this.moneyInVault = 0;  
        this.specialTokens = 0;
        this.stack = [];
        this.moneyStack = []; 
        this.maxStack = 6;
        this.maxMoneyStack = 10;
        
        this.ovenLevel = 1;
        this.ovenSpeed = 3000;
        this.unlockedAreas = { oven2: false, counter2: false };
        this.timeLeft = 120;
        this.isGameOver = false;
        this.maxCustomers = 8; // Lose condition!

        this.buildPizzeria();

        // Players & Groups
        this.player = this.physics.add.sprite(GW/2, GH - 150, 'player').setScale(0.7).setCircle(20).setDrag(2000).setMaxVelocity(300).setCollideWorldBounds(true).setDepth(200);
        this.customers = this.add.group();
        this.readyPizzas = this.add.group();
        this.moneyOnFloor = this.physics.add.group();
        this.vaultPiles = this.add.group();

        this.createHUD();
        this.setupControls();

        // Loops
        this.productionTimer = this.time.addEvent({ delay: this.ovenSpeed, callback: this.bakePizza, callbackScope: this, loop: true });
        this.time.addEvent({ delay: 5000, callback: this.spawnCustomer, callbackScope: this, loop: true });
        this.time.addEvent({ delay: 1000, callback: this.tick, callbackScope: this, loop: true });

        this.spawnCustomer();
        this.cameras.main.fadeIn(500);
    }

    buildPizzeria() {
        this.structures = this.physics.add.staticGroup();
        for(let x=0; x<12; x++) for(let y=0; y<20; y++) this.add.image(x*TILE, y*TILE, 'tile_floor').setAlpha(0.15).setDepth(0);

        this.vaultPos = { x: 380, y: 720 };
        this.add.graphics().fillStyle(0x000, 0.4).fillRoundedRect(this.vaultPos.x-50, this.vaultPos.y-40, 100, 80, 15).lineStyle(2, 0xffd700).strokeRoundedRect(this.vaultPos.x-50, this.vaultPos.y-40, 100, 80, 15);
        this.vaultText = this.add.text(this.vaultPos.x, this.vaultPos.y, '$0', { fontFamily: 'Bangers', fontSize: '24px', color: '#ffd700' }).setOrigin(0.5).setDepth(101);

        this.oven1 = this.structures.create(380, 500, 'oven_master').setScale(1.2).refreshBody();
        this.ovenLabel = this.add.text(380, 440, 'OVEN Lvl.1', { fontFamily: 'Bangers', fontSize: '10px', color: '#ffcc00' }).setOrigin(0.5);

        this.counter1 = this.structures.create(320, 250, 'tile_wall').setScale(2.5, 0.6).refreshBody();
        
        this.exchangePos = { x: 80, y: 150 };
        this.add.graphics().fillStyle(0x5142f5, 0.2).fillRoundedRect(this.exchangePos.x-50, this.exchangePos.y-40, 100, 80, 15).lineStyle(2, 0x00ffff).strokeRoundedRect(this.exchangePos.x-50, this.exchangePos.y-40, 100, 80, 15);
        this.add.text(this.exchangePos.x, this.exchangePos.y, '$1k➔🌟', { fontFamily: 'Bangers', fontSize: '18px', color: '#fff' }).setOrigin(0.5);

        // UNLOCKS WITH TIMERS
        this.createTimedUnlock(225, 500, 'LVL UP OVEN', 'token', 1, () => this.upgradeOven());
        this.createTimedUnlock(130, 250, 'COUNTER B', 'cash', 1500, () => this.unlockCounter2());
        this.createTimedUnlock(80, 500, 'NEW OVEN', 'cash', 2500, () => this.unlockOven2());
    }

    createHUD() {
        // High-end HUD
        const h = this.add.graphics().fillStyle(0xffffff, 0.9).fillRoundedRect(10, 10, 430, 80, 25).lineStyle(4, 0x5142f5).strokeRoundedRect(10, 10, 430, 80, 25).setScrollFactor(0).setDepth(1000);
        this.pocketText = this.add.text(35, 30, '💵 $0', { fontFamily: 'Bangers', fontSize: '32px', color: '#2ecc71' }).setScrollFactor(0).setDepth(1001);
        this.tokenText = this.add.text(35, 60, '🌟 0', { fontFamily: 'Bangers', fontSize: '20px', color: '#ffcc00' }).setScrollFactor(0).setDepth(1001);
        this.timerText = this.add.text(225, 30, '120', { fontFamily: 'Bangers', fontSize: '32px', color: '#333' }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(1001);
        this.queueText = this.add.text(400, 30, 'LINE: 1/8', { fontFamily: 'Bangers', fontSize: '18px', color: '#ff4757' }).setOrigin(1, 0).setScrollFactor(0).setDepth(1001);
    }

    createTimedUnlock(x, y, lbl, type, cost, cb) {
        const zone = this.add.container(x, y);
        const circle = this.add.circle(0, 0, 45, 0xffffff, 0.1).setStrokeStyle(3, type==='cash'?0x2ecc71:0xffcc00, 0.5);
        const price = this.add.text(0, 12, cost + (type==='cash'?'$':'🌟'), { fontFamily: 'Bangers', fontSize: '18px', color: '#fff' }).setOrigin(0.5);
        const progressLine = this.add.graphics();
        zone.add([circle, this.add.text(0, -10, lbl, { fontSize: '9px' }).setOrigin(0.5), price, progressLine]);

        let holdTime = 0;
        this.time.addEvent({ delay: 100, loop: true, callback: () => {
            if (this.isGameOver) return;
            const hasResources = type === 'cash' ? this.moneyInVault >= cost : this.specialTokens >= cost;
            const isNear = Phaser.Math.Distance.Between(this.player.x, this.player.y, x, y) < 50;
            
            if (isNear && hasResources) {
                holdTime += 100;
                progressLine.clear().lineStyle(6, 0xffcc00).arc(0, 0, 45, -Math.PI/2, -Math.PI/2 + (Math.PI*2 * (holdTime/3000)), false).strokePath();
                if (holdTime >= 3000) {
                    if(type==='cash') this.moneyInVault -= cost; else this.specialTokens -= cost;
                    this.updateUI(); zone.destroy(); cb(); this.showPop(x, y, "UNLOCKED!", "#ffcc00");
                }
            } else { holdTime = 0; progressLine.clear(); }
        }});
    }

    update() {
        if (this.isGameOver) return;
        
        let vx=0, vy=0, f=1200;
        if (this.keys.A.isDown) vx=-f; else if (this.keys.D.isDown) vx=f;
        if (this.keys.W.isDown) vy=-f; else if (this.keys.S.isDown) vy=f;
        if (this.isTouching) { vx=this.dx*12; vy=this.dy*12; }
        this.player.setAcceleration(vx, vy);

        // Exchange Shop
        if (Phaser.Math.Distance.Between(this.player.x, this.player.y, this.exchangePos.x, this.exchangePos.y) < 60 && this.moneyInVault >= 1000) {
            this.moneyInVault -= 1000; this.specialTokens++; this.updateUI();
            this.showPop(this.exchangePos.x, this.exchangePos.y, "+1 🌟", "#ffcc00");
            this.playSfx(1000, 'square', 0.2, 0.2);
        }

        // Overlaps
        this.physics.overlap(this.player, this.moneyOnFloor, (p, m) => {
            if (this.moneyStack.length < this.maxMoneyStack) {
                m.destroy(); this.moneyInPocket += 100; this.updateUI();
                this.moneyStack.push(this.add.text(this.player.x, this.player.y, '💵', { fontSize: '18px' }));
            }
        });

        if (Phaser.Math.Distance.Between(this.player.x, this.player.y, this.vaultPos.x, this.vaultPos.y) < 60 && this.moneyInPocket > 0) this.depositAllToVault();

        if (Phaser.Math.Distance.Between(this.player.x, this.player.y, 380, 500) < 60 && this.readyPizzas.getLength() > 0 && this.stack.length < this.maxStack) {
            this.readyPizzas.getChildren()[this.readyPizzas.getLength()-1].destroy();
            this.stack.push(this.add.image(this.player.x, this.player.y, 'pizza_item').setScale(0.55));
        }
        
        if (Phaser.Math.Distance.Between(this.player.x, this.player.y, 320, 250) < 70 && this.stack.length > 0) {
            const box = this.stack.pop(); box.destroy(); this.spawnCash(320, 250);
            const c = this.customers.getChildren()[0];
            if(c) { c.list[1].setText('YES!'); this.tweens.add({ targets: c, x: -100, duration: 1500, onComplete: () => { c.destroy(); this.updateUI(); } }); }
        }

        this.updateStacks();
    }

    depositAllToVault() {
        this.moneyInVault += this.moneyInPocket;
        const totalToStack = Math.floor(this.moneyInPocket / 100);
        this.moneyInPocket = 0;

        this.moneyStack.forEach((b, i) => {
            this.tweens.add({
                targets: b, x: this.vaultPos.x, y: this.vaultPos.y, scale: 0.5, alpha: 0, duration: 400 + (i*50),
                onComplete: () => { 
                    b.destroy(); 
                    this.createVisualVaultBill();
                }
            });
        });
        this.moneyStack = [];
        this.updateUI();
        this.showPop(this.vaultPos.x, this.vaultPos.y, "STASHED! 🏦", "#ffd700");
    }

    createVisualVaultBill() {
        const count = this.vaultPiles.getLength();
        if (count >= 100) return; // Limit visual clutter

        // Calculate grid-based stacking in vault
        const row = Math.floor(count / 5) % 4; // Rows of 5 bills
        const col = count % 5;
        const layer = Math.floor(count / 20); // Height layers

        const bx = this.vaultPos.x - 30 + (col * 15);
        const by = this.vaultPos.y + 20 - (row * 8) - (layer * 4);
        
        const p = this.add.text(bx, by, '💵', { fontSize: '14px' }).setDepth(10 + layer).setAngle(Phaser.Math.Between(-5, 5));
        this.vaultPiles.add(p);
        
        // Satisfying little bounce when added to vault
        this.tweens.add({ targets: p, scale: 1.2, duration: 100, yoyo: true });
    }

    upgradeOven() {
        this.ovenLevel++; this.ovenSpeed = Math.max(500, this.ovenSpeed - 800);
        this.ovenLabel.setText(`OVEN Lvl.${this.ovenLevel}`);
        this.productionTimer.reset({ delay: this.ovenSpeed, callback: this.bakePizza, callbackScope: this, loop: true });
    }

    unlockCounter2() { this.unlockedAreas.counter2 = true; this.structures.create(130, 250, 'tile_wall').setScale(2.5, 0.6).refreshBody(); }
    unlockOven2() { this.unlockedAreas.oven2 = true; this.structures.create(80, 500, 'oven_master').setScale(1.2).refreshBody(); }
    bakePizza() { if (this.readyPizzas.getLength() < 10) this.readyPizzas.add(this.add.image(380, 550 - (this.readyPizzas.getLength()*6), 'pizza_item').setScale(0.5)); }
    
    spawnCustomer() {
        if (this.customers.getLength() >= this.maxCustomers) { this.isGameOver = true; this.scene.start('ResultScene', { playerScore: 0, fail: true }); return; }
        const c = this.add.container(320, -50);
        c.add([this.add.text(0,0, '🧑‍💼', {fontSize:'24px'}).setOrigin(0.5), this.add.text(0, -45, '🍕?', { backgroundColor: '#fff', color: '#000', padding: 3 }).setOrigin(0.5)]);
        this.tweens.add({ targets: c, y: 200 + (this.customers.getLength() * 35), duration: 2000 });
        this.customers.add(c);
        this.updateUI();
    }

    updateUI() {
        this.pocketText.setText(`💵 $${this.moneyInPocket}`);
        this.vaultText.setText(`$${this.moneyInVault}`);
        this.tokenText.setText(`🌟 ${this.specialTokens}`);
        const count = this.customers.getLength();
        this.queueText.setText(`LINE: ${count}/${this.maxCustomers}`);
        if (count >= this.maxCustomers - 2) this.queueText.setColor('#ff0000'); else this.queueText.setColor('#ff4757');
    }

    updateStacks() {
        this.stack.forEach((box, i) => { 
            box.x = Phaser.Math.Linear(box.x, this.player.x, 0.2); 
            box.y = Phaser.Math.Linear(box.y, this.player.y - 25 - (i * 9), 0.2); 
            box.setDepth(201 + i);
        });
        this.moneyStack.forEach((bill, i) => { 
            bill.x = Phaser.Math.Linear(bill.x, this.player.x + 15, 0.2); 
            bill.y = Phaser.Math.Linear(bill.y, this.player.y - 15 - (i * 4), 0.2); 
            bill.setDepth(201 + i);
        });
    }

    spawnCash(x, y) { 
        for(let i=0; i<2; i++) { 
            const bill = this.add.text(x + Phaser.Math.Between(-30, 30), y, '💵', { fontSize: '24px' }); 
            this.physics.add.existing(bill); 
            this.moneyOnFloor.add(bill); 
            this.tweens.add({ targets: bill, y: '+=40', duration: 400, ease: 'Bounce' }); 
        } 
    }
    stackMoneyInVault() { const count = Math.floor(this.moneyInVault / 1000); if (count > this.vaultPiles.getLength() && this.vaultPiles.getLength() < 20) { this.vaultPiles.add(this.add.text(this.vaultPos.x + Phaser.Math.Between(-15, 15), this.vaultPos.y + 20 - (this.vaultPiles.getLength() * 3), '💵', { fontSize: '12px' }).setAngle(Phaser.Math.Between(-10, 10))); } }
    showPop(x, y, txt, col) { const t = this.add.text(x, y, txt, { fontFamily: 'Bangers', fontSize: '24px', color: col }).setOrigin(0.5); this.tweens.add({ targets: t, y: '-=80', alpha: 0, duration: 1000, onComplete: () => t.destroy() }); }
    setupControls() { this.keys = this.input.keyboard.addKeys('W,A,S,D'); this.input.on('pointerdown', (p) => { this.joyX = p.x; this.joyY = p.y; this.isTouching = true; }); this.input.on('pointermove', (p) => { if (this.isTouching) { this.dx = p.x - this.joyX; this.dy = p.y - this.joyY; } }); this.input.on('pointerup', () => { this.isTouching = false; this.dx = 0; this.dy = 0; }); }
    playSfx(f, type, d, v) { try { const o = this.audioCtx.createOscillator(), g = this.audioCtx.createGain(); o.type = type; o.frequency.setValueAtTime(f, this.audioCtx.currentTime); g.gain.setValueAtTime(v, this.audioCtx.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, this.audioCtx.currentTime + d); o.connect(g); g.connect(this.audioCtx.destination); o.start(); o.stop(this.audioCtx.currentTime + d); } catch(e) {} }
    tick() { if(this.timeLeft > 0) { this.timeLeft--; this.timerText.setText(this.timeLeft); } else { this.isGameOver = true; this.scene.start('ResultScene', {playerScore: this.moneyInVault}); } }
}
