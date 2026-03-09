import Phaser from 'phaser';
import { BootScene }               from './scenes/BootScene';
import { PreloadScene }            from './scenes/PreloadScene';
import { CharacterCreationScene }  from './scenes/CharacterCreationScene';
import { LocationScene }           from './scenes/LocationScene';
import { DialogueScene }           from './scenes/DialogueScene';
import { InventoryScene }          from './scenes/InventoryScene';
import { GAME_WIDTH, GAME_HEIGHT } from './utils/constants';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.WEBGL,
  width:           GAME_WIDTH,
  height:          GAME_HEIGHT,
  backgroundColor: '#000000',
  parent:          document.body,
  // Scene order: Phaser starts the first scene automatically (BootScene).
  // Each scene transitions to the next via this.scene.start().
  // DialogueScene and InventoryScene are overlays launched on top of LocationScene.
  scene: [BootScene, PreloadScene, CharacterCreationScene, LocationScene, DialogueScene, InventoryScene],
  scale: {
    mode:       Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
};

new Phaser.Game(config);
