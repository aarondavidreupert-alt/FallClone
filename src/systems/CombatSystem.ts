/**
 * CombatSystem.ts — Turn-based combat logic for the Fallout 1 browser clone.
 *
 * This module is pure game logic with no Phaser dependency.
 * It tracks Action Points, calculates hit chance and damage, and
 * handles turn order.  The scene layer coordinates rendering and AI.
 *
 * Fallout 1 formulas used
 * ───────────────────────
 * Hit chance = base_skill − target_AC − range_penalty    (clamped 5–95 %)
 *   range_penalty = max(0, range − weaponRange/2) × 4 %
 *
 * Damage = roll(min, max)
 *   adjusted  = raw − DT − round(raw × DR / 100)
 *   final     = max(1, adjusted)
 *
 * Critical hit: if d100 roll ≤ luck% → auto-hit, double damage.
 */

// ── Result types ──────────────────────────────────────────────────────────────

export interface CombatResult {
  hit:      boolean;
  critical: boolean;
  damage:   number;
  message:  string;
}

// ── System ────────────────────────────────────────────────────────────────────

export class CombatSystem {
  private _active       = false;
  private _playerAP     = 0;
  private _playerMaxAP  = 0;

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  startCombat(playerMaxAP: number): void {
    this._active      = true;
    this._playerMaxAP = playerMaxAP;
    this._playerAP    = playerMaxAP;
  }

  endCombat(): void {
    this._active  = false;
    this._playerAP = 0;
  }

  // ── State accessors ────────────────────────────────────────────────────────

  get active():      boolean { return this._active; }
  get playerAP():    number  { return this._playerAP; }
  get playerMaxAP(): number  { return this._playerMaxAP; }

  refillPlayerAP(): void {
    this._playerAP = this._playerMaxAP;
  }

  /** Deduct AP from the player's pool.  Returns false if insufficient AP. */
  consumePlayerAP(amount: number): boolean {
    if (this._playerAP < amount) return false;
    this._playerAP -= amount;
    return true;
  }

  // ── Formula implementations ────────────────────────────────────────────────

  /**
   * Calculate percent hit chance (clamped 5–95).
   *
   * @param skill       Attacker's relevant skill value in percent (e.g. 45)
   * @param targetAC    Target's Armor Class
   * @param range       Actual distance in tiles (Chebyshev)
   * @param weaponRange Max effective range of the weapon in tiles
   */
  calculateHitChance(
    skill:       number,
    targetAC:    number,
    range:       number,
    weaponRange: number,
  ): number {
    const halfRange    = Math.max(1, weaponRange / 2);
    const rangePenalty = range > halfRange ? Math.round((range - halfRange) * 4) : 0;
    const raw          = skill - targetAC - rangePenalty;
    return Math.min(95, Math.max(5, raw));
  }

  /**
   * Roll random damage and apply target's damage reduction.
   *
   * @param dmgMin    Weapon minimum damage
   * @param dmgMax    Weapon maximum damage
   * @param targetDR  Target's damage resistance (0–100 %)
   * @param targetDT  Target's damage threshold (flat subtraction)
   */
  rollDamage(
    dmgMin:   number,
    dmgMax:   number,
    targetDR: number,
    targetDT: number,
  ): number {
    const raw       = dmgMin + Math.floor(Math.random() * (dmgMax - dmgMin + 1));
    const reduced   = raw - targetDT - Math.round(raw * targetDR / 100);
    return Math.max(1, reduced);
  }

  // ── Player attack ──────────────────────────────────────────────────────────

  /**
   * Resolve a player attack against a target.
   * Deducts AP; returns CombatResult.
   */
  playerAttack(opts: {
    skillValue:  number;
    dmgMin:      number;
    dmgMax:      number;
    apCost:      number;
    weaponRange: number;
    targetAC:    number;
    targetDR:    number;
    targetDT:    number;
    range:       number;
    critChance:  number;    // luck % for crit
  }): CombatResult {
    const { skillValue, dmgMin, dmgMax, apCost, weaponRange,
            targetAC, targetDR, targetDT, range, critChance } = opts;

    if (!this.consumePlayerAP(apCost)) {
      return { hit: false, critical: false, damage: 0, message: 'Not enough AP!' };
    }

    const hitChance = this.calculateHitChance(skillValue, targetAC, range, weaponRange);
    const roll      = Math.floor(Math.random() * 100) + 1;

    // Critical check
    if (roll <= Math.max(1, critChance)) {
      const dmg = this.rollDamage(dmgMin, dmgMax, targetDR, targetDT) * 2;
      return { hit: true, critical: true, damage: dmg,
               message: `Critical hit!  ${dmg} damage.` };
    }

    if (roll > hitChance) {
      return { hit: false, critical: false, damage: 0,
               message: `Miss!  (rolled ${roll}, needed ≤ ${hitChance}%)` };
    }

    const dmg = this.rollDamage(dmgMin, dmgMax, targetDR, targetDT);
    return { hit: true, critical: false, damage: dmg,
             message: `Hit!  ${dmg} damage.  (${roll} ≤ ${hitChance}%)` };
  }

  // ── Enemy attack ───────────────────────────────────────────────────────────

  /**
   * Resolve an enemy attack against the player.
   * Does NOT consume enemy AP (handled by the scene's AI logic).
   */
  enemyAttack(opts: {
    skill:    number;
    dmgMin:   number;
    dmgMax:   number;
    range:    number;
    range_max:number;
    targetAC: number;
    targetDR: number;
  }): CombatResult {
    const { skill, dmgMin, dmgMax, range, range_max, targetAC, targetDR } = opts;

    const hitChance = this.calculateHitChance(skill, targetAC, range, range_max);
    const roll      = Math.floor(Math.random() * 100) + 1;

    if (roll > hitChance) {
      return { hit: false, critical: false, damage: 0,
               message: `misses!  (${roll} > ${hitChance}%)` };
    }

    const dmg = this.rollDamage(dmgMin, dmgMax, targetDR, 0);
    return { hit: true, critical: false, damage: dmg,
             message: `hits for ${dmg} damage!` };
  }
}
