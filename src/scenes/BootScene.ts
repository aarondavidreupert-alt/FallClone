import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  create(): void {
    const { width, height } = this.scale;

    // Black background
    this.add.rectangle(width / 2, height / 2, width, height, 0x000000);

    // Fallout-style amber title text
    const title = this.add.text(width / 2, height / 2 - 60, 'FALLOUT', {
      fontFamily: 'monospace',
      fontSize: '64px',
      color: '#c8a000',
      stroke: '#000000',
      strokeThickness: 4,
    });
    title.setOrigin(0.5);

    const subtitle = this.add.text(width / 2, height / 2 + 10, 'A POST NUCLEAR ROLE PLAYING GAME', {
      fontFamily: 'monospace',
      fontSize: '16px',
      color: '#a07800',
    });
    subtitle.setOrigin(0.5);

    const status = this.add.text(width / 2, height / 2 + 80, 'INITIALIZING...', {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#607030',
    });
    status.setOrigin(0.5);

    // Blink the status text
    this.tweens.add({
      targets: status,
      alpha: 0,
      duration: 500,
      ease: 'Linear',
      yoyo: true,
      repeat: -1,
    });

    const version = this.add.text(width - 8, height - 8, 'v0.1.0', {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#404040',
    });
    version.setOrigin(1, 1);
  }
}
