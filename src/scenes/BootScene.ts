/**
 * BootScene.ts — Splash screen + async LST pre-fetch.
 *
 * Displays the Fallout intro splash for at least 2.2 s while fetching the
 * five LST lookup tables (tiles, critters, items, scenery, walls) in parallel
 * from public/assets/data/.  Both the fetch AND the minimum display timer must
 * complete before the scene transitions to PreloadScene.
 *
 * The fetched LstData is stored in the Phaser registry under the key 'lstData'
 * so PreloadScene can read it immediately when its preload() runs.
 */

import Phaser from 'phaser';
import { loadLstTables, EMPTY_LST, type LstData } from '../loaders/AssetRegistry';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  create(): void {
    const { width, height } = this.scale;

    // ── Splash UI ──────────────────────────────────────────────────────────
    this.add.rectangle(width / 2, height / 2, width, height, 0x000000);

    this.add.text(width / 2, height / 2 - 60, 'FALLOUT', {
      fontFamily:      'monospace',
      fontSize:        '64px',
      color:           '#c8a000',
      stroke:          '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5);

    this.add.text(width / 2, height / 2 + 10, 'A POST NUCLEAR ROLE PLAYING GAME', {
      fontFamily: 'monospace',
      fontSize:   '16px',
      color:      '#a07800',
    }).setOrigin(0.5);

    const status = this.add.text(width / 2, height / 2 + 80, 'LOADING DATA…', {
      fontFamily: 'monospace',
      fontSize:   '14px',
      color:      '#607030',
    }).setOrigin(0.5);

    this.tweens.add({
      targets:  status,
      alpha:    0,
      duration: 500,
      ease:     'Linear',
      yoyo:     true,
      repeat:   -1,
    });

    this.add.text(width - 8, height - 8, 'v0.1.0', {
      fontFamily: 'monospace',
      fontSize:   '11px',
      color:      '#404040',
    }).setOrigin(1, 1);

    // ── Async LST fetch + minimum display time ─────────────────────────────
    // Both must complete before we transition to PreloadScene.
    const lstPromise = loadLstTables().catch(() => EMPTY_LST as LstData);
    const minDelay   = new Promise<void>(resolve =>
      this.time.delayedCall(2200, resolve),
    );

    Promise.all([lstPromise, minDelay]).then(([lstData]) => {
      this.registry.set('lstData', lstData);
      this.cameras.main.fadeOut(300, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.scene.start('PreloadScene');
      });
    }).catch(() => {
      this.registry.set('lstData', EMPTY_LST);
      this.scene.start('PreloadScene');
    });
  }
}
