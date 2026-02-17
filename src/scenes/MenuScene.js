import Phaser from 'phaser';
import { auth } from '../network/auth';

export class MenuScene extends Phaser.Scene {
    constructor() { super({ key: 'MenuScene' }); }

    create() {
        const { width: w, height: h } = this.cameras.main;
        
        // Background
        this.add.graphics().fillGradientStyle(0x0a0a1e, 0x0a0a1e, 0x1a1a4e, 0x0f0c29, 1).fillRect(0, 0, w, h);

        // Floating pizza emojis in background
        for (let i = 0; i < 6; i++) {
            const pizza = this.add.text(
                Phaser.Math.Between(30, w - 30), Phaser.Math.Between(100, h - 100),
                '🍕', { fontSize: `${Phaser.Math.Between(20, 40)}px` }
            ).setAlpha(0.1).setDepth(0);
            this.tweens.add({ targets: pizza, y: `-=${Phaser.Math.Between(20, 50)}`, alpha: 0.2, duration: Phaser.Math.Between(2000, 4000), yoyo: true, repeat: -1 });
        }
        
        // Logo
        this.add.text(w/2, 100, 'LOCAL\nDE PIZZA', {
            fontFamily: 'Bangers', fontSize: '80px', color: '#ffffff', align: 'center', 
            stroke: '#5142f5', strokeThickness: 14,
            shadow: { offsetX: 0, offsetY: 8, color: '#000', fill: true, stroke: true }
        }).setOrigin(0.5).setDepth(20);

        this.add.text(w/2, 195, '— ZK TYCOON —', {
            fontFamily: 'Orbitron', fontSize: '16px', color: '#ffcc00', fontWeight: 'bold'
        }).setOrigin(0.5).setDepth(20);

        // Character Preview
        this.charContainer = this.add.container(w/2, 330);
        this.charSprite = this.add.sprite(0, 0, 'player').setScale(3.5);
        this.charContainer.add([this.add.image(0, 45, 'shadow').setAlpha(0.3).setScale(1.3), this.charSprite]);
        
        // Idle animation
        this.tweens.add({ targets: this.charSprite, y: -8, duration: 1200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

        // How to play
        const instructions = [
            '🔥 Oven bakes pizzas automatically',
            '🍕 Walk to oven → pick up stack',
            '🛎️ Walk to counter → serve customers',
            '💵 Collect cash → deposit in vault',
            '🌟 Exchange cash for tokens → upgrade!',
            '⚠️ Don\'t let the line overflow!'
        ];
        
        const instructBg = this.add.graphics()
            .fillStyle(0x000, 0.4).fillRoundedRect(w/2 - 190, 430, 380, 180, 20)
            .setDepth(10);
        
        instructions.forEach((txt, i) => {
            this.add.text(w/2, 450 + (i * 25), txt, { 
                fontFamily: 'Orbitron', fontSize: '11px', color: '#ccc' 
            }).setOrigin(0.5).setDepth(11);
        });

        // Global progress bar
        const progress = parseFloat(localStorage.getItem('global_party_progress') || "74.00");
        this.add.graphics()
            .fillStyle(0x333, 0.8).fillRoundedRect(w/2 - 160, 630, 320, 30, 15)
            .fillStyle(0x2ecc71, 1).fillRoundedRect(w/2 - 160, 630, 320 * (progress / 100), 30, 15)
            .lineStyle(2, 0xffffff, 0.5).strokeRoundedRect(w/2 - 160, 630, 320, 30, 15)
            .setDepth(10);
        this.add.text(w/2, 645, `🌐 Global Party: ${progress}%`, { fontFamily: 'Orbitron', fontSize: '11px', color: '#fff', fontWeight: 'bold' }).setOrigin(0.5).setDepth(11);

        // Play Button
        this.createJuiceButton(w/2, 710, '🍕 PLAY!', 0xffcc00, () => this.handleStart());
        
        // Login
        this.loginBtn = this.createJuiceButton(w/2, 50, '🔑 LOGIN', 0x5142f5, () => this.handleConnect(), 0xffffff, 150, 42);

        this.checkExistingLogin();
        this.cameras.main.fadeIn(400);
    }

    createJuiceButton(x, y, txt, col, cb, textCol=0xffffff, bw=280, bh=70) {
        const c = this.add.container(x, y);
        const shadow = this.add.graphics().fillStyle(0x000, 0.3).fillRoundedRect(-bw/2, -bh/2+6, bw, bh, 22);
        const bg = this.add.graphics()
            .fillStyle(col, 1).fillRoundedRect(-bw/2, -bh/2, bw, bh, 22)
            .lineStyle(4, 0xffffff, 0.8).strokeRoundedRect(-bw/2, -bh/2, bw, bh, 22);
        const t = this.add.text(0, 0, txt, { fontFamily: 'Bangers', fontSize: bh > 50 ? '34px' : '18px', color: Phaser.Display.Color.IntegerToColor(textCol).rgba }).setOrigin(0.5);
        if(textCol === 0xffffff) t.setStroke('#000', 4);
        c.add([shadow, bg, t]);
        c.setInteractive(new Phaser.Geom.Rectangle(-bw/2, -bh/2, bw, bh), Phaser.Geom.Rectangle.Contains).on('pointerdown', () => {
            this.tweens.add({ targets: c, scale: 0.92, duration: 80, yoyo: true, onComplete: cb });
        });
        return { container: c, text: t };
    }

    async handleConnect() { const w = await auth.login(); if (w) this.loginBtn.text.setText(w.short); }
    async checkExistingLogin() { const u = await auth.checkSession(); if (u) this.loginBtn.text.setText(u.short); }
    handleStart() { if (!auth.address) this.handleConnect(); else this.scene.start('ArenaScene'); }
}
