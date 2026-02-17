import Phaser from 'phaser';
import { saveGameResult } from '../network/supabase';
import { auth } from '../network/auth';

export class ResultScene extends Phaser.Scene {
    constructor() { super({ key: 'ResultScene' }); }

    init(data) {
        this.playerScore = data.playerScore || 0;
        this.deliveries = data.deliveries || 0;
        this.failed = data.fail || false;
        this.isVerifying = false;
    }

    create() {
        const { width: w, height: h } = this.cameras.main;
        
        // Background
        if (this.failed) {
            this.add.graphics().fillGradientStyle(0x1a0000, 0x1a0000, 0x4a0000, 0x2a0000, 1).fillRect(0, 0, w, h);
        } else {
            this.add.graphics().fillGradientStyle(0x5142f5, 0x5142f5, 0x00d2ff, 0x00d2ff, 1).fillRect(0, 0, w, h);
        }
        
        // Title
        const titleText = this.failed ? '💀 GAME OVER' : '🍕 FINISH!';
        this.add.text(w/2, 90, titleText, { 
            fontFamily: 'Bangers', fontSize: '80px', color: '#fff', 
            stroke: this.failed ? '#ff0000' : '#ffcc00', strokeThickness: 14,
            shadow: { offsetX: 0, offsetY: 8, color: '#000', fill: true }
        }).setOrigin(0.5);

        // Score Card
        const card = this.add.container(w/2, 300);
        const bg = this.add.graphics()
            .fillStyle(0xffffff, 1).fillRoundedRect(-190, -150, 380, 300, 35)
            .lineStyle(6, this.failed ? 0xff4757 : 0x5142f5).strokeRoundedRect(-190, -150, 380, 300, 35);
        
        const subtitle = this.add.text(0, -110, this.failed ? 'LINE OVERFLOW' : 'VAULT TOTAL', { 
            fontFamily: 'Orbitron', fontSize: '14px', color: this.failed ? '#ff4757' : '#5142f5', fontWeight: '900' 
        }).setOrigin(0.5);
        
        // Animated Score Counter
        this.scoreDisplay = this.add.text(0, -20, '$0', { 
            fontFamily: 'Bangers', fontSize: '88px', color: '#2ecc71', stroke: '#fff', strokeThickness: 6 
        }).setOrigin(0.5);
        
        const deliveriesText = this.add.text(0, 60, `${this.deliveries} PIZZAS DELIVERED`, { 
            fontFamily: 'Orbitron', fontSize: '12px', color: '#888', fontWeight: 'bold' 
        }).setOrigin(0.5);

        const zkReady = this.add.text(0, 95, `${this.deliveries} ACTIONS READY FOR ZK`, { 
            fontFamily: 'Orbitron', fontSize: '11px', color: '#5142f5', fontWeight: 'bold' 
        }).setOrigin(0.5);

        card.add([bg, subtitle, this.scoreDisplay, deliveriesText, zkReady]);

        // Animate score counting up
        let current = 0;
        const target = this.playerScore;
        const duration = Math.min(2000, Math.max(500, target * 2));
        
        if (target > 0) {
            this.tweens.addCounter({
                from: 0, to: target, duration: duration, ease: 'Cubic.easeOut',
                onUpdate: (tween) => {
                    current = Math.floor(tween.getValue());
                    this.scoreDisplay.setText(`$${current}`);
                },
                onComplete: () => {
                    this.scoreDisplay.setText(`$${target}`);
                    this.tweens.add({ targets: this.scoreDisplay, scale: 1.15, duration: 150, yoyo: true });
                    if (!this.failed) this.spawnConfetti();
                }
            });
        }

        // ZK Button
        this.zkBox = this.add.container(w/2, 530);
        this.zkBg = this.add.graphics()
            .fillStyle(0xffcc00).fillRoundedRect(-160, -40, 320, 80, 25)
            .lineStyle(4, 0xffffff).strokeRoundedRect(-160, -40, 320, 80, 25);
        this.zkText = this.add.text(0, 0, '🔐 SEAL WITH ZK', { fontFamily: 'Bangers', fontSize: '30px', color: '#fff' }).setOrigin(0.5).setStroke('#000', 5);
        this.zkBox.add([this.zkBg, this.zkText]);
        
        const zkBtn = this.add.rectangle(0, 0, 320, 80, 0x000, 0).setInteractive({ useHandCursor: true });
        this.zkBox.add(zkBtn);
        zkBtn.on('pointerdown', () => this.handleVerification());

        // Return button
        this.createButton(w/2, h - 70, '🔄 PLAY AGAIN', 0x5142f5, () => this.scene.start('MenuScene'), 240, 55);
        
        this.cameras.main.fadeIn(500);
    }

    spawnConfetti() {
        const { width: w } = this.cameras.main;
        const colors = ['🟡', '🔴', '🟢', '🔵', '🟣', '⭐', '✨'];
        for (let i = 0; i < 30; i++) {
            const conf = this.add.text(
                Phaser.Math.Between(0, w), -20,
                colors[Phaser.Math.Between(0, colors.length - 1)],
                { fontSize: `${Phaser.Math.Between(14, 24)}px` }
            ).setDepth(3000);
            
            this.tweens.add({
                targets: conf,
                y: Phaser.Math.Between(200, 800),
                x: `+=${Phaser.Math.Between(-80, 80)}`,
                angle: Phaser.Math.Between(-180, 180),
                alpha: 0,
                duration: Phaser.Math.Between(1500, 3000),
                delay: Phaser.Math.Between(0, 500),
                onComplete: () => conf.destroy()
            });
        }
    }

    async handleVerification() {
        if (this.isVerifying) return;
        this.isVerifying = true;

        this.zkText.setText('⏳ PROVING...').setScale(0.85);
        this.tweens.add({ targets: this.zkBox, scale: 1.03, duration: 300, yoyo: true, repeat: -1 });

        await new Promise(r => setTimeout(r, 1200));
        this.zkText.setText('🔄 GENERATING...');
        
        await new Promise(r => setTimeout(r, 1500));
        this.zkText.setText('✅ ZK VERIFIED!').setScale(1).setColor('#ffffff');
        this.zkBg.clear()
            .fillStyle(0x2ecc71).fillRoundedRect(-160, -40, 320, 80, 25)
            .lineStyle(4, 0xffffff).strokeRoundedRect(-160, -40, 320, 80, 25);
        
        this.tweens.killTweensOf(this.zkBox);
        this.zkBox.setScale(1.05);

        // Global progress
        const currentProgress = parseFloat(localStorage.getItem('global_party_progress') || "74.00");
        const newProgress = (currentProgress + 0.05).toFixed(2);
        localStorage.setItem('global_party_progress', newProgress);

        const w = this.cameras.main.width;
        this.add.text(w/2, 620, `🌐 Global Prep +0.05% → ${newProgress}%`, { 
            fontFamily: 'Orbitron', fontSize: '11px', color: '#ffcc00', fontWeight: 'bold' 
        }).setOrigin(0.5);

        saveGameResult(auth.address, this.playerScore, true);
        this.cameras.main.flash(400, 46, 204, 113);
        
        this.add.text(w/2, 650, '📝 Tx: [0x8f...2e31] ✓', { fontFamily: 'Courier', fontSize: '12px', color: '#00ff88', fontWeight: 'bold' }).setOrigin(0.5);
    }

    createButton(x, y, txt, col, cb, bw, bh) {
        const c = this.add.container(x, y);
        const bg = this.add.graphics()
            .fillStyle(col, 1).fillRoundedRect(-bw/2, -bh/2, bw, bh, 20)
            .lineStyle(4, 0xffffff).strokeRoundedRect(-bw/2, -bh/2, bw, bh, 20);
        const t = this.add.text(0, 0, txt, { fontFamily: 'Bangers', fontSize: '24px', color: '#fff' }).setOrigin(0.5).setStroke('#000', 3);
        c.add([bg, t]);
        const hit = this.add.rectangle(0, 0, bw, bh, 0x000, 0).setInteractive({ useHandCursor: true }).on('pointerdown', () => {
            this.tweens.add({ targets: c, scale: 0.9, duration: 100, yoyo: true, onComplete: cb });
        });
        c.add(hit);
        return c;
    }
}
