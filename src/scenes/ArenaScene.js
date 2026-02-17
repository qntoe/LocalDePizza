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
        this.maxCustomers = 8;
        this.comboCount = 0;
        this.lastDeliveryTime = 0;
        this.totalDeliveries = 0;
        this.gameStarted = false;

        this.buildPizzeria();

        // Players & Groups
        this.player = this.physics.add.sprite(GW/2, GH - 150, 'player').setScale(0.7).setCircle(20).setDrag(2000).setMaxVelocity(300).setCollideWorldBounds(true).setDepth(200);
        this.player.setAlpha(0); // Hidden until countdown
        this.customers = this.add.group();
        this.readyPizzas = this.add.group();
        this.moneyOnFloor = this.physics.add.group();
        this.vaultPiles = this.add.group();

        // Trail particles
        this.trailEmitter = this.add.particles(0, 0, 'pizza_item', {
            speed: { min: 5, max: 15 },
            scale: { start: 0.15, end: 0 },
            alpha: { start: 0.6, end: 0 },
            lifespan: 400,
            frequency: 80,
            follow: this.player,
            followOffset: { x: 0, y: 10 },
            tint: 0xffcc00,
            blendMode: 'ADD',
        }).setDepth(199);

        this.createHUD();
        this.setupControls();

        // --- COUNTDOWN 3-2-1-GO ---
        this.showCountdown();
    }

    showCountdown() {
        const { width: w, height: h } = this.cameras.main;
        const overlay = this.add.graphics().fillStyle(0x000, 0.7).fillRect(0, 0, w, h).setDepth(5000);
        
        const nums = ['3', '2', '1', 'GO!'];
        const colors = ['#ff4757', '#ffcc00', '#2ecc71', '#ffffff'];
        let i = 0;

        const countText = this.add.text(w/2, h/2, '', {
            fontFamily: 'Bangers', fontSize: '160px', color: '#fff',
            stroke: '#000', strokeThickness: 12
        }).setOrigin(0.5).setDepth(5001);

        const showNext = () => {
            if (i >= nums.length) {
                countText.destroy();
                overlay.destroy();
                this.startGame();
                return;
            }
            countText.setText(nums[i]).setColor(colors[i]).setScale(2).setAlpha(1);
            this.tweens.add({
                targets: countText, scale: 1, duration: 600, ease: 'Back.easeOut'
            });
            this.tweens.add({
                targets: countText, alpha: 0, duration: 200, delay: 600,
                onComplete: () => { i++; showNext(); }
            });
            this.playSfx(i < 3 ? 440 : 880, 'sine', 0.15, 0.3);
        };
        showNext();
    }

    startGame() {
        this.gameStarted = true;
        this.player.setAlpha(1);
        this.cameras.main.fadeIn(300);
        
        // Start game loops
        this.productionTimer = this.time.addEvent({ delay: this.ovenSpeed, callback: this.bakePizza, callbackScope: this, loop: true });
        this.time.addEvent({ delay: 5000, callback: this.spawnCustomer, callbackScope: this, loop: true });
        this.time.addEvent({ delay: 1000, callback: this.tick, callbackScope: this, loop: true });

        this.spawnCustomer();
    }

    buildPizzeria() {
        this.structures = this.physics.add.staticGroup();
        
        // Tiled floor with alternating pattern
        for(let x = 0; x < 12; x++) {
            for(let y = 0; y < 20; y++) {
                const tile = this.add.image(x * TILE, y * TILE, 'tile_floor').setDepth(0);
                tile.setAlpha((x + y) % 2 === 0 ? 0.12 : 0.18);
            }
        }

        // --- VAULT (Bottom Right) ---
        this.vaultPos = { x: 380, y: 720 };
        const vaultGfx = this.add.graphics()
            .fillStyle(0x1a1a2e, 0.8).fillRoundedRect(this.vaultPos.x-55, this.vaultPos.y-45, 110, 90, 18)
            .lineStyle(3, 0xffd700, 0.8).strokeRoundedRect(this.vaultPos.x-55, this.vaultPos.y-45, 110, 90, 18);
        this.add.text(this.vaultPos.x, this.vaultPos.y - 35, '🏦 VAULT', { fontFamily: 'Bangers', fontSize: '14px', color: '#ffd700' }).setOrigin(0.5);
        this.vaultText = this.add.text(this.vaultPos.x, this.vaultPos.y + 10, '$0', { fontFamily: 'Bangers', fontSize: '28px', color: '#ffd700' }).setOrigin(0.5).setDepth(101);
        
        // Vault glow pulse
        this.tweens.add({ targets: vaultGfx, alpha: 0.6, duration: 1500, yoyo: true, repeat: -1 });

        // --- OVEN 1 ---
        this.oven1 = this.structures.create(380, 500, 'oven_master').setScale(1.2).refreshBody();
        this.ovenLabel = this.add.text(380, 440, '🔥 OVEN Lvl.1', { fontFamily: 'Bangers', fontSize: '12px', color: '#ffcc00' }).setOrigin(0.5);
        this.ovenGlow = this.add.circle(380, 500, 50, 0xff5722, 0.1).setDepth(0);
        this.tweens.add({ targets: this.ovenGlow, alpha: 0.25, scale: 1.1, duration: 800, yoyo: true, repeat: -1 });

        // --- COUNTER A (Top) ---
        this.counter1 = this.structures.create(320, 250, 'tile_wall').setScale(2.5, 0.6).refreshBody();
        this.add.text(320, 220, '🛎️ COUNTER A', { fontFamily: 'Bangers', fontSize: '13px', color: '#fff' }).setOrigin(0.5);

        // --- EXCHANGE (Top Left) ---
        this.exchangePos = { x: 80, y: 150 };
        this.add.graphics()
            .fillStyle(0x5142f5, 0.25).fillRoundedRect(this.exchangePos.x-55, this.exchangePos.y-45, 110, 90, 18)
            .lineStyle(2, 0x00ffff, 0.6).strokeRoundedRect(this.exchangePos.x-55, this.exchangePos.y-45, 110, 90, 18);
        this.add.text(this.exchangePos.x, this.exchangePos.y - 20, '🔄 EXCHANGE', { fontFamily: 'Bangers', fontSize: '11px', color: '#00ffff' }).setOrigin(0.5);
        this.add.text(this.exchangePos.x, this.exchangePos.y + 10, '$1k ➔ 🌟', { fontFamily: 'Bangers', fontSize: '20px', color: '#fff' }).setOrigin(0.5);

        // --- PIZZA STACK INDICATOR near oven ---
        this.ovenStackText = this.add.text(380, 560, '🍕 x0', { fontFamily: 'Bangers', fontSize: '16px', color: '#fff' }).setOrigin(0.5).setDepth(50);

        // --- UNLOCKS ---
        this.createTimedUnlock(225, 500, '⬆️ LVL OVEN', 'token', 1, () => this.upgradeOven());
        this.createTimedUnlock(130, 250, '🛎️ COUNTER B', 'cash', 1500, () => this.unlockCounter2());
        this.createTimedUnlock(80, 500, '🔥 OVEN 2', 'cash', 2500, () => this.unlockOven2());
    }

    createHUD() {
        // Sleek HUD background
        this.add.graphics()
            .fillStyle(0x0a0a1e, 0.92).fillRoundedRect(5, 5, 440, 85, 20)
            .lineStyle(3, 0x5142f5, 0.6).strokeRoundedRect(5, 5, 440, 85, 20)
            .setScrollFactor(0).setDepth(1000);
        
        // Accent line
        this.add.graphics().fillStyle(0x5142f5, 0.4).fillRect(15, 55, 420, 2).setScrollFactor(0).setDepth(1000);
        
        this.pocketText = this.add.text(25, 18, '💵 $0', { fontFamily: 'Bangers', fontSize: '28px', color: '#2ecc71' }).setScrollFactor(0).setDepth(1001);
        this.tokenText = this.add.text(25, 62, '🌟 0', { fontFamily: 'Bangers', fontSize: '18px', color: '#ffcc00' }).setScrollFactor(0).setDepth(1001);
        this.timerText = this.add.text(225, 20, '120', { fontFamily: 'Bangers', fontSize: '36px', color: '#fff' }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(1001);
        this.queueText = this.add.text(430, 18, '📋 1/8', { fontFamily: 'Bangers', fontSize: '16px', color: '#ff4757' }).setOrigin(1, 0).setScrollFactor(0).setDepth(1001);
        this.comboText = this.add.text(430, 62, '', { fontFamily: 'Bangers', fontSize: '16px', color: '#ffcc00' }).setOrigin(1, 0).setScrollFactor(0).setDepth(1001);
        
        // Stack capacity indicator (bottom of screen)
        this.stackCapText = this.add.text(GW/2, GH - 20, '', { fontFamily: 'Orbitron', fontSize: '12px', color: '#aaa' }).setOrigin(0.5).setScrollFactor(0).setDepth(1001);
    }

    createTimedUnlock(x, y, lbl, type, cost, cb) {
        const zone = this.add.container(x, y);
        const circle = this.add.circle(0, 0, 45, 0xffffff, 0.05).setStrokeStyle(3, type==='cash'?0x2ecc71:0xffcc00, 0.4);
        const label = this.add.text(0, -14, lbl, { fontFamily: 'Bangers', fontSize: '11px', color: '#fff' }).setOrigin(0.5);
        const price = this.add.text(0, 14, (type==='cash'?'$':'')+cost + (type==='token'?' 🌟':''), { fontFamily: 'Bangers', fontSize: '18px', color: type==='cash'?'#2ecc71':'#ffcc00' }).setOrigin(0.5);
        const progressLine = this.add.graphics();
        zone.add([circle, label, price, progressLine]);

        // Pulse when affordable
        let holdTime = 0;
        this.time.addEvent({ delay: 100, loop: true, callback: () => {
            if (this.isGameOver || !this.gameStarted) return;
            const hasResources = type === 'cash' ? this.moneyInVault >= cost : this.specialTokens >= cost;
            const isNear = Phaser.Math.Distance.Between(this.player.x, this.player.y, x, y) < 50;
            
            // Glow when affordable
            circle.setStrokeStyle(3, type==='cash'?0x2ecc71:0xffcc00, hasResources ? 0.8 : 0.3);
            
            if (isNear && hasResources) {
                holdTime += 100;
                const progress = holdTime / 2000;
                progressLine.clear().lineStyle(6, 0xffcc00).arc(0, 0, 45, -Math.PI/2, -Math.PI/2 + (Math.PI*2 * progress), false).strokePath();
                if (holdTime >= 2000) {
                    if(type==='cash') this.moneyInVault -= cost; else this.specialTokens -= cost;
                    this.updateUI(); zone.destroy(); cb(); 
                    this.showPop(x, y, "✨ UNLOCKED!", "#ffcc00");
                    this.playSfx(1200, 'sine', 0.3, 0.3);
                    this.cameras.main.shake(200, 0.005);
                }
            } else { holdTime = 0; progressLine.clear(); }
        }});
    }

    update() {
        if (this.isGameOver || !this.gameStarted) return;
        
        // --- MOVEMENT ---
        let vx=0, vy=0, f=1400;
        if (this.keys.A.isDown) vx=-f; else if (this.keys.D.isDown) vx=f;
        if (this.keys.W.isDown) vy=-f; else if (this.keys.S.isDown) vy=f;
        if (this.isTouching) { vx=this.dx*14; vy=this.dy*14; }
        this.player.setAcceleration(vx, vy);

        // Trail visibility
        const isMoving = Math.abs(this.player.body.velocity.x) > 30 || Math.abs(this.player.body.velocity.y) > 30;
        this.trailEmitter.setFrequency(isMoving ? 60 : -1);

        // --- PROXIMITY INDICATORS ---
        this.checkProximity();

        // --- EXCHANGE SHOP ---
        if (Phaser.Math.Distance.Between(this.player.x, this.player.y, this.exchangePos.x, this.exchangePos.y) < 60 && this.moneyInVault >= 1000) {
            this.moneyInVault -= 1000; this.specialTokens++; this.updateUI();
            this.showPop(this.exchangePos.x, this.exchangePos.y, "+1 🌟", "#00ffff");
            this.playSfx(1000, 'square', 0.2, 0.2);
        }

        // --- COLLECT MONEY ---
        this.physics.overlap(this.player, this.moneyOnFloor, (p, m) => {
            if (this.moneyStack.length < this.maxMoneyStack) {
                m.destroy(); this.moneyInPocket += 100; this.updateUI();
                this.moneyStack.push(this.add.text(this.player.x, this.player.y, '💵', { fontSize: '18px' }).setDepth(201));
                this.playSfx(500, 'sine', 0.05, 0.15);
            }
        });

        // --- DEPOSIT TO VAULT ---
        if (Phaser.Math.Distance.Between(this.player.x, this.player.y, this.vaultPos.x, this.vaultPos.y) < 60 && this.moneyInPocket > 0) {
            this.depositAllToVault();
        }

        // --- PICK UP PIZZA FROM OVEN ---
        const dOven1 = Phaser.Math.Distance.Between(this.player.x, this.player.y, 380, 500);
        const dOven2 = this.unlockedAreas.oven2 ? Phaser.Math.Distance.Between(this.player.x, this.player.y, 80, 500) : 999;
        if ((dOven1 < 60 || dOven2 < 60) && this.readyPizzas.getLength() > 0 && this.stack.length < this.maxStack) {
            const p = this.readyPizzas.getChildren()[this.readyPizzas.getLength()-1];
            p.destroy();
            this.stack.push(this.add.image(this.player.x, this.player.y, 'pizza_item').setScale(0.55).setDepth(201));
            this.playSfx(600, 'triangle', 0.05, 0.15);
            this.updateOvenStack();
            this.updateStackCapacity();
        }
        
        // --- DELIVER AT COUNTER ---
        const dCounter1 = Phaser.Math.Distance.Between(this.player.x, this.player.y, 320, 250);
        const dCounter2 = this.unlockedAreas.counter2 ? Phaser.Math.Distance.Between(this.player.x, this.player.y, 130, 250) : 999;
        if ((dCounter1 < 70 || dCounter2 < 70) && this.stack.length > 0) {
            this.processDelivery(dCounter1 < 70 ? 320 : 130);
        }

        this.updateStacks();
    }

    checkProximity() {
        // Glow effect near interactable zones
        const zones = [
            { x: 380, y: 500, cond: this.readyPizzas.getLength() > 0 && this.stack.length < this.maxStack },
            { x: 320, y: 250, cond: this.stack.length > 0 },
            { x: this.vaultPos.x, y: this.vaultPos.y, cond: this.moneyInPocket > 0 },
        ];
        
        zones.forEach(z => {
            const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, z.x, z.y);
            if (dist < 100 && z.cond) {
                // Arrow indicator pointing to interaction
                if (!z._arrow) {
                    z._arrow = this.add.text(z.x, z.y - 60, '⬇️', { fontSize: '20px' }).setOrigin(0.5).setDepth(500);
                    this.tweens.add({ targets: z._arrow, y: z.y - 50, duration: 500, yoyo: true, repeat: -1 });
                }
            }
        });
    }

    processDelivery(targetX) {
        const box = this.stack.pop();
        if (!box) return;
        
        // Combo system
        const now = this.time.now;
        if (now - this.lastDeliveryTime < 8000 && this.lastDeliveryTime > 0) {
            this.comboCount++;
        } else {
            this.comboCount = 1;
        }
        this.lastDeliveryTime = now;
        this.totalDeliveries++;

        const multiplier = 1 + (Math.min(this.comboCount, 5) - 1) * 0.25;
        const baseReward = 200;
        
        // Delivery VFX
        this.tweens.add({
            targets: box, x: targetX, y: 220, scale: 0, rotation: Math.PI,
            duration: 300, ease: 'Back.easeIn',
            onComplete: () => { 
                box.destroy(); 
                this.spawnCash(targetX, 250, multiplier);
                this.deliveryVFX(targetX, 250);
            }
        });

        // Combo display
        if (this.comboCount > 1) {
            const comboLabel = `🔥 x${this.comboCount} COMBO!`;
            this.comboText.setText(comboLabel);
            this.showPop(targetX, 200, `x${multiplier.toFixed(2)} 💰`, '#ffcc00');
            this.playSfx(800 + this.comboCount * 100, 'sine', 0.15, 0.3);
        } else {
            this.comboText.setText('');
            this.playSfx(800, 'sine', 0.1, 0.2);
        }
        
        // Serve customer
        const c = this.customers.getChildren()[0];
        if(c) { 
            c.list[1].setText('😋 YES!'); 
            this.tweens.add({ targets: c, x: -100, alpha: 0, duration: 1200, ease: 'Cubic.easeIn',
                onComplete: () => { c.destroy(); this.updateUI(); } 
            }); 
        }
        this.updateStackCapacity();
    }

    deliveryVFX(x, y) {
        // Starburst
        for (let i = 0; i < 8; i++) {
            const angle = (Math.PI * 2 / 8) * i;
            const star = this.add.text(x, y, '⭐', { fontSize: '16px' }).setOrigin(0.5).setDepth(500);
            this.tweens.add({
                targets: star,
                x: x + Math.cos(angle) * 60,
                y: y + Math.sin(angle) * 60,
                alpha: 0, scale: 0,
                duration: 500,
                onComplete: () => star.destroy()
            });
        }
        this.cameras.main.shake(100, 0.003);
    }

    depositAllToVault() {
        const amount = this.moneyInPocket;
        this.moneyInVault += amount;
        this.moneyInPocket = 0;

        this.moneyStack.forEach((b, i) => {
            this.tweens.add({
                targets: b, x: this.vaultPos.x, y: this.vaultPos.y, scale: 0.5, alpha: 0, 
                duration: 300 + (i*40),
                onComplete: () => { b.destroy(); this.createVisualVaultBill(); }
            });
        });
        this.moneyStack = [];
        this.updateUI();
        this.showPop(this.vaultPos.x, this.vaultPos.y, `+$${amount} 🏦`, '#ffd700');
        this.playSfx(400, 'sine', 0.15, 0.2);
    }

    createVisualVaultBill() {
        const count = this.vaultPiles.getLength();
        if (count >= 80) return;

        const row = Math.floor(count / 5) % 4;
        const col = count % 5;
        const layer = Math.floor(count / 20);

        const bx = this.vaultPos.x - 30 + (col * 15);
        const by = this.vaultPos.y + 20 - (row * 8) - (layer * 4);
        
        const p = this.add.text(bx, by, '💵', { fontSize: '13px' }).setDepth(10 + layer).setAngle(Phaser.Math.Between(-8, 8));
        this.vaultPiles.add(p);
        this.tweens.add({ targets: p, scale: 1.15, duration: 80, yoyo: true });
    }

    upgradeOven() {
        this.ovenLevel++; 
        this.ovenSpeed = Math.max(800, this.ovenSpeed - 700);
        this.ovenLabel.setText(`🔥 OVEN Lvl.${this.ovenLevel}`);
        this.productionTimer.reset({ delay: this.ovenSpeed, callback: this.bakePizza, callbackScope: this, loop: true });
        this.cameras.main.flash(300, 255, 200, 0);
    }

    unlockCounter2() { 
        this.unlockedAreas.counter2 = true; 
        this.structures.create(130, 250, 'tile_wall').setScale(2.5, 0.6).refreshBody(); 
        this.add.text(130, 220, '🛎️ COUNTER B', { fontFamily: 'Bangers', fontSize: '13px', color: '#fff' }).setOrigin(0.5);
        this.cameras.main.flash(300, 50, 200, 50);
    }
    
    unlockOven2() { 
        this.unlockedAreas.oven2 = true; 
        this.structures.create(80, 500, 'oven_master').setScale(1.2).refreshBody(); 
        this.add.text(80, 440, '🔥 OVEN 2', { fontFamily: 'Bangers', fontSize: '12px', color: '#ffcc00' }).setOrigin(0.5);
        this.cameras.main.flash(300, 255, 100, 0);
    }
    
    bakePizza() { 
        if (this.readyPizzas.getLength() < 10) {
            const pizza = this.add.image(380, 555 - (this.readyPizzas.getLength()*7), 'pizza_item').setScale(0.5).setDepth(50);
            this.readyPizzas.add(pizza);
            // Pop in animation
            pizza.setScale(0);
            this.tweens.add({ targets: pizza, scale: 0.5, duration: 200, ease: 'Back.easeOut' });
            this.updateOvenStack();
        }
        if (this.unlockedAreas.oven2 && this.readyPizzas.getLength() < 10) {
            const pizza2 = this.add.image(80, 555 - (this.readyPizzas.getLength()*4), 'pizza_item').setScale(0.5).setDepth(50);
            this.readyPizzas.add(pizza2);
            pizza2.setScale(0);
            this.tweens.add({ targets: pizza2, scale: 0.5, duration: 200, ease: 'Back.easeOut' });
        }
    }
    
    spawnCustomer() {
        if (!this.gameStarted) return;
        if (this.customers.getLength() >= this.maxCustomers) { 
            this.gameOver(true); 
            return; 
        }
        const targetX = this.unlockedAreas.counter2 && Math.random() > 0.5 ? 130 : 320;
        const c = this.add.container(targetX, -50);
        const emojis = ['🧑‍💼', '👩‍💼', '🧔', '👩‍🦰', '🧑‍🍳', '👨‍💻'];
        const emoji = emojis[Phaser.Math.Between(0, emojis.length-1)];
        c.add([
            this.add.text(0, 0, emoji, {fontSize:'28px'}).setOrigin(0.5), 
            this.add.text(0, -45, '🍕?', { fontFamily: 'Bangers', fontSize: '18px', backgroundColor: '#fff', color: '#000', padding: {x:6, y:3} }).setOrigin(0.5)
        ]);
        this.tweens.add({ targets: c, y: 200 + (this.customers.getLength() * 40), duration: 1500, ease: 'Cubic.easeOut' });
        this.customers.add(c);
        this.updateUI();
        this.playSfx(300, 'sine', 0.05, 0.1);
    }

    gameOver(failed = false) {
        this.isGameOver = true;
        const { width: w, height: h } = this.cameras.main;
        
        if (failed) {
            // LINE OVERFLOW - lose
            const flash = this.add.text(w/2, h/2, '🍕 LINE OVERFLOW! 🍕', {
                fontFamily: 'Bangers', fontSize: '42px', color: '#ff4757',
                stroke: '#000', strokeThickness: 8
            }).setOrigin(0.5).setDepth(5000);
            this.cameras.main.shake(500, 0.01);
            this.time.delayedCall(2000, () => this.scene.start('ResultScene', { playerScore: this.moneyInVault, deliveries: this.totalDeliveries, fail: true }));
        } else {
            // TIME'S UP
            const flash = this.add.text(w/2, h/2, "⏰ TIME'S UP! ⏰", {
                fontFamily: 'Bangers', fontSize: '48px', color: '#ffcc00',
                stroke: '#000', strokeThickness: 8
            }).setOrigin(0.5).setDepth(5000).setScale(0);
            this.tweens.add({ targets: flash, scale: 1.2, duration: 500, ease: 'Back.easeOut' });
            this.cameras.main.flash(800, 255, 204, 0);
            this.playSfx(660, 'sine', 0.5, 0.3);
            this.time.delayedCall(2000, () => this.scene.start('ResultScene', { playerScore: this.moneyInVault, deliveries: this.totalDeliveries }));
        }
    }

    updateUI() {
        this.pocketText.setText(`💵 $${this.moneyInPocket}`);
        this.vaultText.setText(`$${this.moneyInVault}`);
        this.tokenText.setText(`🌟 ${this.specialTokens}`);
        const count = this.customers.getLength();
        this.queueText.setText(`📋 ${count}/${this.maxCustomers}`);
        if (count >= this.maxCustomers - 2) { 
            this.queueText.setColor('#ff0000');
        } else if (count >= this.maxCustomers - 4) {
            this.queueText.setColor('#ffaa00');
        } else {
            this.queueText.setColor('#2ecc71');
        }
    }

    updateOvenStack() {
        this.ovenStackText.setText(`🍕 x${this.readyPizzas.getLength()}`);
    }

    updateStackCapacity() {
        if (this.stack.length > 0) {
            this.stackCapText.setText(`📦 ${this.stack.length}/${this.maxStack}`).setAlpha(1);
        } else {
            this.stackCapText.setAlpha(0);
        }
    }

    updateStacks() {
        this.stack.forEach((box, i) => { 
            box.x = Phaser.Math.Linear(box.x, this.player.x, 0.25); 
            box.y = Phaser.Math.Linear(box.y, this.player.y - 28 - (i * 10), 0.25); 
            box.setDepth(201 + i);
            // Slight wobble
            box.setAngle(Math.sin(this.time.now * 0.005 + i) * 3);
        });
        this.moneyStack.forEach((bill, i) => { 
            bill.x = Phaser.Math.Linear(bill.x, this.player.x + 18, 0.2); 
            bill.y = Phaser.Math.Linear(bill.y, this.player.y - 12 - (i * 5), 0.2); 
            bill.setDepth(201 + i);
        });
    }

    spawnCash(x, y, multiplier = 1) { 
        const count = Math.ceil(2 * multiplier);
        for(let i = 0; i < count; i++) { 
            const bill = this.add.text(x + Phaser.Math.Between(-40, 40), y, '💵', { fontSize: '24px' }); 
            this.physics.add.existing(bill); 
            this.moneyOnFloor.add(bill); 
            this.tweens.add({ targets: bill, y: `+=${Phaser.Math.Between(30, 60)}`, duration: 400, ease: 'Bounce' }); 
        } 
    }

    showPop(x, y, txt, col) { 
        const t = this.add.text(x, y, txt, { fontFamily: 'Bangers', fontSize: '26px', color: col, stroke: '#000', strokeThickness: 4 }).setOrigin(0.5).setDepth(2000); 
        this.tweens.add({ targets: t, y: '-=90', alpha: 0, scale: 1.3, duration: 1000, ease: 'Cubic.easeOut', onComplete: () => t.destroy() }); 
    }

    setupControls() { 
        this.keys = this.input.keyboard.addKeys('W,A,S,D'); 
        this.input.on('pointerdown', (p) => { this.joyX = p.x; this.joyY = p.y; this.isTouching = true; }); 
        this.input.on('pointermove', (p) => { if (this.isTouching) { this.dx = p.x - this.joyX; this.dy = p.y - this.joyY; } }); 
        this.input.on('pointerup', () => { this.isTouching = false; this.dx = 0; this.dy = 0; }); 
    }

    playSfx(f, type, d, v) { 
        try { 
            const o = this.audioCtx.createOscillator(), g = this.audioCtx.createGain(); 
            o.type = type; o.frequency.setValueAtTime(f, this.audioCtx.currentTime); 
            g.gain.setValueAtTime(v, this.audioCtx.currentTime); 
            g.gain.exponentialRampToValueAtTime(0.0001, this.audioCtx.currentTime + d); 
            o.connect(g); g.connect(this.audioCtx.destination); 
            o.start(); o.stop(this.audioCtx.currentTime + d); 
        } catch(e) {} 
    }

    tick() { 
        if (!this.gameStarted) return;
        if(this.timeLeft > 0) { 
            this.timeLeft--; 
            this.timerText.setText(this.timeLeft);
            
            // Timer urgency colors
            if (this.timeLeft <= 10) {
                this.timerText.setColor('#ff0000');
                this.tweens.add({ targets: this.timerText, scale: 1.3, duration: 200, yoyo: true });
                this.playSfx(220, 'square', 0.08, 0.15);
            } else if (this.timeLeft <= 30) {
                this.timerText.setColor('#ffaa00');
            }
        } else { 
            this.gameOver(false);
        } 
    }
}
