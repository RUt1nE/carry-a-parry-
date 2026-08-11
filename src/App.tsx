import { useEffect, useRef, useState } from 'react';
import { Auth } from './components/Auth';

type Keys = Record<string, boolean>;

type Zombie = {
  x: number;
  y: number;
  vx: number;
  hp: number;
  maxHp: number;
  attackTimer: number;
  stunTimer: number;
  biteTimer: number;
  windupTimer: number;
  attackTarget: 'player' | 'cart' | null;
  parriedThisSwing: boolean;
  kind: 'crawler' | 'runner' | 'brute' | 'boss';
};

type Spark = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
};

const WIDTH = 960;
const HEIGHT = 540;
const GROUND = 405;
const PLAYER_W = 42;
const PLAYER_H = 74;
const FINAL_ROOM = 25;

const locations = [
  {
    name: 'Scrapyard',
    sky: '#102236',
    far: '#2b4152',
    mid: '#4c3c4d',
    ground: '#6f5d46',
    accent: '#ffda67',
    hazard: '#d55b42',
    decor: 'cranes',
  },
  {
    name: 'Toxic Alley',
    sky: '#13251c',
    far: '#27533d',
    mid: '#3b4b66',
    ground: '#40523a',
    accent: '#80ff9e',
    hazard: '#9cff57',
    decor: 'pipes',
  },
  {
    name: 'Neon Ruins',
    sky: '#1b1531',
    far: '#40295d',
    mid: '#1f5b73',
    ground: '#52425b',
    accent: '#ff65d8',
    hazard: '#57d5ff',
    decor: 'signs',
  },
];

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function rectsOverlap(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function keyName(event: KeyboardEvent) {
  const codeMap: Record<string, string> = {
    KeyA: 'left',
    KeyD: 'right',
    KeyW: 'jump',
    ArrowLeft: 'left',
    ArrowRight: 'right',
    ArrowUp: 'jump',
    Space: 'jump',
    KeyF: 'parry',
    KeyE: 'portal',
  };

  return codeMap[event.code] ?? event.key.toLowerCase();
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName) || target.isContentEditable;
}

function zombieStats(kind: Zombie['kind'], room: number) {
  const roomBoost = Math.floor((room - 1) / 3);
  if (kind === 'boss') return { hp: 10 + Math.floor(room / 5) * 5, speed: 30 + room * 2 };
  if (kind === 'runner') return { hp: 2 + roomBoost, speed: 72 + room * 6 };
  if (kind === 'brute') return { hp: 5 + roomBoost, speed: 34 + room * 3 };
  return { hp: 3 + roomBoost, speed: 48 + room * 4 };
}

function createZombie(kind: Zombie['kind'], x: number, room: number, index = 0): Zombie {
  const stats = zombieStats(kind, room);
  return {
    x,
    y: GROUND - 58,
    vx: 0,
    hp: stats.hp,
    maxHp: stats.hp,
    attackTimer: 1.2,
    stunTimer: 0,
    biteTimer: index * 0.18,
    windupTimer: 0,
    attackTarget: null,
    parriedThisSwing: false,
    kind,
  };
}

function spawnZombies(locationIndex: number, room: number): Zombie[] {
  if (room % 5 === 0) {
    const boss = createZombie('boss', 700, room, 0);
    const helperCount = Math.min(1 + Math.floor(room / 10), 3);
    const helpers = Array.from({ length: helperCount }, (_, index) => {
      const kind: Zombie['kind'] = index % 2 === 0 ? 'runner' : 'crawler';
      return createZombie(kind, 520 + index * 120, room, index + 1);
    });
    return [boss, ...helpers];
  }

  const count = clamp(2 + Math.floor((room - 1) / 2), 2, 7);
  const kinds: Zombie['kind'][] = ['crawler', 'runner', 'crawler', 'brute', 'runner', 'crawler', 'brute'];

  return Array.from({ length: count }, (_, index) => {
    const kind = kinds[(index + room + locationIndex) % kinds.length];
    const side = index % 2 === 0 ? 1 : -1;
    const x = side > 0 ? 620 + index * 54 : 370 - index * 32;
    const zombie = createZombie(kind, x, room, index);
    zombie.vx = side * -zombieStats(kind, room).speed;
    return zombie;
  });
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const keysRef = useRef<Keys>({});
  const gameRef = useRef({
    player: { x: 170, y: GROUND - PLAYER_H, vx: 0, vy: 0, facing: 1, hp: 6, invuln: 0 },
    cart: { x: 78, y: GROUND - 45, vx: 0, hp: 8, maxHp: 8, invuln: 0 },
    zombies: spawnZombies(0, 1),
    sparks: [] as Spark[],
    portalTimer: 0,
    location: 0,
    room: 1,
    parryTimer: 0,
    parryCooldown: 0,
    hitStop: 0,
    won: false,
    message: 'Комната 1. Защищай вагонетку и чисти путь.',
    messageTimer: 4,
  });
  const [hud, setHud] = useState({
    hp: 6,
    cartHp: 8,
    room: 1,
    location: locations[0].name,
    zombies: 2,
    boss: false,
    won: false,
    message: 'Комната 1. Защищай вагонетку и чисти путь.',
  });

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      keysRef.current[keyName(event)] = true;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
        event.preventDefault();
      }
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      keysRef.current[keyName(event)] = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    let frame = 0;
    let last = performance.now();

    const addSparks = (x: number, y: number, color: string, count = 14) => {
      const game = gameRef.current;
      for (let i = 0; i < count; i += 1) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 60 + Math.random() * 210;
        game.sparks.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 0.28 + Math.random() * 0.34,
          color,
        });
      }
    };

    const switchLocation = () => {
      const game = gameRef.current;
      if (game.room >= FINAL_ROOM) {
        game.won = true;
        game.message = 'Финал: 25 комнат пройдены. Вагонетка выжила.';
        game.messageTimer = 99;
        addSparks(WIDTH / 2, GROUND - 145, '#fff36e', 80);
        return;
      }
      game.room += 1;
      game.location = (game.location + 1) % locations.length;
      game.player.x = 130;
      game.cart.x = 40;
      game.cart.hp = Math.min(game.cart.maxHp, game.cart.hp + 2);
      game.zombies = spawnZombies(game.location, game.room);
      game.portalTimer = 0.7;
      game.message = game.room % 5 === 0 ? `БОСС ${game.room / 5}: ${locations[game.location].name}` : `Комната ${game.room}: ${locations[game.location].name}`;
      game.messageTimer = 2.8;
      addSparks(850, GROUND - 80, locations[game.location].accent, 36);
    };

    const drawBackground = (time: number) => {
      const game = gameRef.current;
      const loc = locations[game.location];
      const gradient = ctx.createLinearGradient(0, 0, 0, HEIGHT);
      gradient.addColorStop(0, loc.sky);
      gradient.addColorStop(1, '#101014');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      ctx.fillStyle = loc.far;
      for (let i = 0; i < 9; i += 1) {
        const x = i * 132 - ((time * 0.012) % 132);
        const h = 90 + ((i * 37) % 86);
        ctx.fillRect(x, GROUND - 130 - h * 0.25, 76, h);
        ctx.fillRect(x + 38, GROUND - 170 - h * 0.2, 54, h + 42);
      }

      ctx.fillStyle = loc.mid;
      for (let i = 0; i < 7; i += 1) {
        const x = i * 168 - ((time * 0.025) % 168);
        ctx.beginPath();
        ctx.moveTo(x, GROUND);
        ctx.lineTo(x + 58, GROUND - 115 - (i % 3) * 18);
        ctx.lineTo(x + 118, GROUND);
        ctx.closePath();
        ctx.fill();
      }

      ctx.fillStyle = loc.hazard;
      ctx.globalAlpha = 0.78;
      if (loc.decor === 'cranes') {
        for (let i = 0; i < 4; i += 1) {
          const x = 95 + i * 225 - ((time * 0.018) % 90);
          ctx.fillRect(x, GROUND - 215, 10, 145);
          ctx.fillRect(x - 44, GROUND - 218, 98, 8);
          ctx.fillRect(x + 46, GROUND - 218, 5, 52);
        }
      } else if (loc.decor === 'pipes') {
        for (let i = 0; i < 6; i += 1) {
          const x = 40 + i * 165;
          ctx.fillRect(x, GROUND - 98 - (i % 2) * 24, 128, 14);
          ctx.fillRect(x + 108, GROUND - 98 - (i % 2) * 24, 14, 64);
        }
      } else {
        for (let i = 0; i < 5; i += 1) {
          const x = 90 + i * 176;
          ctx.fillRect(x, GROUND - 190, 64, 32);
          ctx.fillRect(x + 25, GROUND - 158, 9, 86);
        }
      }
      ctx.globalAlpha = 1;

      ctx.fillStyle = loc.ground;
      ctx.fillRect(0, GROUND, WIDTH, HEIGHT - GROUND);
      ctx.fillStyle = '#191716';
      ctx.fillRect(0, GROUND, WIDTH, 8);
      ctx.fillStyle = '#2a2721';
      for (let x = 0; x < WIDTH; x += 52) {
        ctx.fillRect(x, GROUND + 31, 32, 7);
      }

      ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
      const roomMarks = 5 + (game.room % 6);
      for (let i = 0; i < roomMarks; i += 1) {
        ctx.fillRect(80 + i * 135, GROUND + 10 + (i % 2) * 28, 46, 3);
      }

      if (game.room % 5 === 0) {
        ctx.fillStyle = 'rgba(255, 58, 84, 0.16)';
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
        ctx.fillStyle = locations[game.location].accent;
        ctx.font = '900 28px Inter, system-ui, sans-serif';
        ctx.fillText(`BOSS ROOM ${game.room}`, 34, GROUND - 305);
      }
    };

    const drawPortal = (time: number) => {
      const loc = locations[gameRef.current.location];
      const pulse = Math.sin(time * 0.01) * 8;
      ctx.save();
      ctx.translate(850, GROUND - 86);
      ctx.rotate(time * 0.0018);
      ctx.strokeStyle = loc.accent;
      ctx.lineWidth = 8;
      ctx.shadowColor = loc.accent;
      ctx.shadowBlur = 24;
      ctx.beginPath();
      ctx.ellipse(0, 0, 35 + pulse, 75 - pulse * 0.3, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = '#9fffea';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(0, 0, 20 - pulse * 0.2, 58 + pulse * 0.2, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    };

    const drawCart = () => {
      const { player, cart } = gameRef.current;
      ctx.strokeStyle = '#c7bca6';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(player.x + PLAYER_W * 0.25, player.y + 45);
      ctx.lineTo(cart.x + 92, cart.y + 18);
      ctx.stroke();

      ctx.fillStyle = cart.invuln > 0 ? '#6d3a42' : '#34343c';
      ctx.fillRect(cart.x, cart.y, 112, 38);
      ctx.fillStyle = '#5b6070';
      ctx.fillRect(cart.x + 8, cart.y + 8, 96, 18);
      ctx.fillStyle = '#ffda67';
      ctx.fillRect(cart.x + 8, cart.y - 22, 96 * (cart.hp / cart.maxHp), 6);
      ctx.strokeStyle = '#17171a';
      ctx.lineWidth = 2;
      ctx.strokeRect(cart.x + 8, cart.y - 22, 96, 6);
      ctx.fillStyle = '#17171a';
      ctx.beginPath();
      ctx.arc(cart.x + 24, cart.y + 43, 14, 0, Math.PI * 2);
      ctx.arc(cart.x + 86, cart.y + 43, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#9da7b7';
      ctx.fillRect(cart.x + 25, cart.y - 12, 42, 14);
    };

    const drawPlayer = () => {
      const { player, parryTimer, parryCooldown } = gameRef.current;
      const cx = player.x + PLAYER_W / 2;
      ctx.save();
      ctx.translate(cx, player.y);
      ctx.scale(player.facing, 1);
      ctx.translate(-cx, -player.y);
      ctx.fillStyle = player.invuln > 0 ? '#ffeff8' : '#8fe0ff';
      ctx.fillRect(player.x + 9, player.y + 18, 25, 42);
      ctx.fillStyle = '#f2c28f';
      ctx.fillRect(player.x + 10, player.y, 24, 24);
      ctx.fillStyle = '#24232a';
      ctx.fillRect(player.x + 8, player.y - 5, 29, 10);
      ctx.fillStyle = '#141419';
      ctx.fillRect(player.x + 12, player.y + 60, 9, 14);
      ctx.fillRect(player.x + 28, player.y + 60, 9, 14);
      ctx.fillStyle = '#d6f7ff';
      ctx.fillRect(player.x + 30, player.y + 9, 5, 5);
      ctx.fillStyle = parryCooldown > 0 ? '#555967' : '#fff36e';
      ctx.fillRect(player.x + 36, player.y + 28, 11, 23);
      ctx.fillStyle = '#c8edf7';
      ctx.fillRect(player.x + 39, player.y + 31, 5, 17);
      ctx.restore();

      if (parryTimer > 0) {
        ctx.strokeStyle = '#fff36e';
        ctx.lineWidth = 4;
        ctx.shadowColor = '#fff36e';
        ctx.shadowBlur = 20;
        ctx.beginPath();
        ctx.arc(player.x + PLAYER_W / 2, player.y + 36, 48, 0, Math.PI * 2);
        ctx.stroke();
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(player.x + PLAYER_W / 2, player.y + 36, 30, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
    };

    const drawWarningStar = (x: number, y: number, size: number, color: string) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(frame * 0.18);
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 18;
      ctx.beginPath();
      for (let i = 0; i < 8; i += 1) {
        const radius = i % 2 === 0 ? size : size * 0.36;
        const angle = (Math.PI * 2 * i) / 8;
        const px = Math.cos(angle) * radius;
        const py = Math.sin(angle) * radius;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    };

    const drawZombie = (zombie: Zombie) => {
      ctx.save();
      const wobble = Math.sin(frame * 0.12 + zombie.x * 0.05) * 4;
      ctx.translate(zombie.x, zombie.y + wobble);
      const scale = zombie.kind === 'boss' ? 1.82 : zombie.kind === 'brute' ? 1.22 : zombie.kind === 'runner' ? 0.86 : 1;
      ctx.scale(scale, scale);
      ctx.fillStyle = zombie.stunTimer > 0 ? '#dfff7c' : zombie.kind === 'boss' ? '#8b4759' : zombie.kind === 'runner' ? '#a6d58e' : zombie.kind === 'brute' ? '#78905d' : '#9bc47d';
      ctx.fillRect(9, 10, 30, 39);
      ctx.fillStyle = zombie.kind === 'boss' ? '#a94e67' : zombie.kind === 'brute' ? '#8ba36d' : '#a6d58e';
      ctx.fillRect(10, -10, 27, 25);
      ctx.fillStyle = '#24331e';
      ctx.fillRect(18, -2, 6, 5);
      if (zombie.kind === 'boss') {
        ctx.fillStyle = '#fff36e';
        ctx.fillRect(9, -18, 8, 8);
        ctx.fillRect(30, -18, 8, 8);
        ctx.fillStyle = '#31202a';
        ctx.fillRect(4, 47, 41, 7);
      }
      ctx.fillStyle = '#522323';
      ctx.fillRect(29, 6, 10, 5);
      ctx.strokeStyle = '#6f8861';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(11, 22);
      ctx.lineTo(-7, 33);
      ctx.moveTo(38, 24);
      ctx.lineTo(55, 36);
      ctx.stroke();
      ctx.fillStyle = '#2c2b26';
      ctx.fillRect(12, 48, 8, 12);
      ctx.fillRect(31, 48, 8, 12);
      ctx.fillStyle = '#f35b5b';
      ctx.fillRect(8, -17, 33 * (zombie.hp / zombie.maxHp), 4);
      ctx.restore();

      if (zombie.windupTimer > 0 && zombie.attackTarget) {
        const flash = zombie.windupTimer < 0.22 ? '#ffffff' : '#fff36e';
        const starSize = zombie.kind === 'boss' ? 22 : 13;
        drawWarningStar(zombie.x + (zombie.kind === 'boss' ? 52 : 30), zombie.y + (zombie.kind === 'boss' ? -48 : -24), starSize + Math.sin(frame * 0.42) * 3, flash);
      }

      if (zombie.kind === 'boss') {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.56)';
        ctx.fillRect(WIDTH / 2 - 180, 132, 360, 15);
        ctx.fillStyle = '#ff3a54';
        ctx.fillRect(WIDTH / 2 - 176, 136, 352 * (zombie.hp / zombie.maxHp), 7);
        ctx.fillStyle = '#fff';
        ctx.font = '900 14px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`BOSS ${Math.ceil(gameRef.current.room / 5)} HP`, WIDTH / 2, 126);
        ctx.textAlign = 'left';
      }
    };

    const drawSparks = () => {
      for (const spark of gameRef.current.sparks) {
        ctx.fillStyle = spark.color;
        ctx.globalAlpha = clamp(spark.life * 2.4, 0, 1);
        ctx.fillRect(spark.x, spark.y, 5, 5);
      }
      ctx.globalAlpha = 1;
    };

    const update = (dt: number) => {
      const game = gameRef.current;
      const keys = keysRef.current;
      const p = game.player;
      const inputX = (keys.left ? -1 : 0) + (keys.right ? 1 : 0);

      if (game.won) {
        game.messageTimer = 99;
        return;
      }

      if (game.hitStop > 0) {
        game.hitStop -= dt;
        return;
      }

      if (keys.parry && game.parryCooldown <= 0) {
        game.parryTimer = 0.19;
        game.parryCooldown = 0.62;
        game.message = 'PARRY WINDOW';
        game.messageTimer = 0.45;
        addSparks(p.x + PLAYER_W / 2, p.y + 34, '#fff36e', 10);
      }

      p.vx = inputX * 215;
      if (inputX !== 0) p.facing = inputX;
      if (keys.jump && p.y >= GROUND - PLAYER_H - 1) p.vy = -430;
      p.vy += 1030 * dt;
      p.x = clamp(p.x + p.vx * dt, 20, WIDTH - 72);
      p.y = Math.min(GROUND - PLAYER_H, p.y + p.vy * dt);

      const desiredCartX = p.x - 105;
      const pull = clamp(desiredCartX - game.cart.x, -130, 130);
      game.cart.vx += pull * 5.5 * dt;
      game.cart.vx *= 0.9;
      game.cart.x = clamp(game.cart.x + game.cart.vx * dt, 6, WIDTH - 145);
      game.cart.invuln = Math.max(0, game.cart.invuln - dt);

      const playerAtPortal = rectsOverlap({ x: p.x, y: p.y, w: PLAYER_W, h: PLAYER_H }, { x: 810, y: GROUND - 170, w: 90, h: 160 });
      const cartAtPortal = rectsOverlap({ x: game.cart.x, y: game.cart.y - 22, w: 112, h: 70 }, { x: 800, y: GROUND - 170, w: 108, h: 160 });
      if (keys.portal && playerAtPortal) {
        if (game.zombies.length === 0 && cartAtPortal) {
          switchLocation();
        } else {
          game.message = game.zombies.length > 0 ? 'Сначала зачисти комнату.' : 'Дотащи вагонетку ближе к порталу.';
          game.messageTimer = 0.9;
        }
      }

      for (const zombie of game.zombies) {
        if (zombie.hp <= 0) continue;
        zombie.stunTimer = Math.max(0, zombie.stunTimer - dt);
        zombie.biteTimer = Math.max(0, zombie.biteTimer - dt);
        if (zombie.windupTimer > 0) {
          zombie.windupTimer = Math.max(0, zombie.windupTimer - dt);
        }
        if (zombie.stunTimer <= 0 && zombie.windupTimer <= 0) {
          const cartCenter = game.cart.x + 56;
          const playerDistance = Math.abs((p.x + PLAYER_W / 2) - zombie.x);
          const cartDistance = Math.abs(cartCenter - zombie.x) * (game.cart.hp <= 3 ? 0.72 : 1);
          const targetX = cartDistance < playerDistance ? cartCenter : p.x + PLAYER_W / 2;
          const direction = targetX > zombie.x ? 1 : -1;
          const speed = zombieStats(zombie.kind, game.room).speed;
          zombie.vx = direction * speed;
          zombie.x += zombie.vx * dt;
        }

        const zombieBox = { x: zombie.x + 4, y: zombie.y - 10, w: 54, h: 70 };
        if (zombie.kind === 'boss') {
          zombieBox.x = zombie.x + 4;
          zombieBox.y = zombie.y - 24;
          zombieBox.w = 92;
          zombieBox.h = 118;
        }
        const cartBox = { x: game.cart.x, y: game.cart.y - 22, w: 112, h: 70 };
        const playerBox = { x: p.x, y: p.y, w: PLAYER_W, h: PLAYER_H };
        const canHitCart = rectsOverlap(cartBox, zombieBox);
        const canHitPlayer = rectsOverlap(playerBox, zombieBox);

        if (zombie.hp > 0 && zombie.biteTimer <= 0 && zombie.windupTimer <= 0 && (canHitPlayer || canHitCart)) {
          zombie.attackTarget = canHitCart && (!canHitPlayer || game.cart.hp <= p.hp) ? 'cart' : 'player';
          zombie.windupTimer = zombie.kind === 'boss' ? Math.max(0.42, 0.78 - game.room * 0.012) : Math.max(0.34, 0.62 - game.room * 0.025);
          zombie.parriedThisSwing = false;
          zombie.biteTimer = 99;
        }

        const targetBox = zombie.attackTarget === 'cart' ? cartBox : playerBox;
        const parryRange = { x: p.x - 54, y: p.y - 8, w: PLAYER_W + 108, h: PLAYER_H + 24 };
        if (zombie.kind === 'boss') {
          parryRange.x = p.x - 78;
          parryRange.y = p.y - 20;
          parryRange.w = PLAYER_W + 156;
          parryRange.h = PLAYER_H + 40;
        }
        const canParrySwing =
          zombie.hp > 0 &&
          zombie.windupTimer > 0 &&
          zombie.windupTimer < 0.24 &&
          !zombie.parriedThisSwing &&
          game.parryTimer > 0 &&
          rectsOverlap(parryRange, zombieBox);

        if (canParrySwing) {
          zombie.hp -= 1;
          zombie.stunTimer = zombie.kind === 'boss' ? 0.72 : 1.05;
          zombie.windupTimer = 0;
          zombie.attackTarget = null;
          zombie.parriedThisSwing = true;
          zombie.biteTimer = Math.max(0.44, 0.8 - game.room * 0.035);
          zombie.x += Math.sign(zombie.x - p.x || p.facing) * (zombie.kind === 'boss' ? 28 : 58);
          game.hitStop = zombie.kind === 'boss' ? 0.075 : 0.055;
          game.message = zombie.hp <= 0 ? (zombie.kind === 'boss' ? 'BOSS PARRIED TO DEATH' : 'PERFECT PARRY: zombie down') : zombie.kind === 'boss' ? 'BOSS PARRY' : 'PERFECT PARRY';
          game.messageTimer = 0.9;
          addSparks(zombie.x + (zombie.kind === 'boss' ? 52 : 24), zombie.y + 14, '#fff36e', zombie.kind === 'boss' ? 58 : 34);
        }

        if (zombie.hp > 0 && zombie.windupTimer <= 0 && zombie.attackTarget && !zombie.parriedThisSwing) {
          if (rectsOverlap(targetBox, zombieBox)) {
            if (zombie.attackTarget === 'cart' && game.cart.invuln <= 0) {
              game.cart.hp -= zombie.kind === 'boss' ? 3 : zombie.kind === 'brute' ? 2 : 1;
              game.cart.invuln = 0.7;
              game.message = 'Вагонетку ударили. Жми F на звезде перед ударом.';
              game.messageTimer = 1.1;
              addSparks(game.cart.x + 60, game.cart.y + 14, '#ff6b4f', 18);
            } else if (zombie.attackTarget === 'player' && p.invuln <= 0) {
              p.hp -= zombie.kind === 'boss' ? 2 : 1;
              p.invuln = 0.8;
              p.x -= Math.sign(zombie.vx || 1) * 34;
              game.message = 'Попал удар. Жми F когда вспыхивает звезда.';
              game.messageTimer = 1.2;
              addSparks(p.x + 20, p.y + 34, '#ff5f6d', 14);
            }
          }
          zombie.stunTimer = 0.12;
          zombie.attackTarget = null;
          zombie.biteTimer = zombie.kind === 'boss' ? Math.max(0.65, 1.05 - game.room * 0.02) : Math.max(0.44, 0.78 - game.room * 0.035);
        }
      }

      game.zombies = game.zombies.filter((zombie) => zombie.hp > 0);
      if (game.zombies.length === 0 && game.messageTimer <= 0) {
        game.message = game.room >= FINAL_ROOM ? 'Финальный босс повержен. Заезжай в портал.' : 'Комната зачищена. Тащи вагонетку в портал и жми E.';
        game.messageTimer = 0.6;
      }

      if (p.hp <= 0 || game.cart.hp <= 0) {
        game.player = { x: 170, y: GROUND - PLAYER_H, vx: 0, vy: 0, facing: 1, hp: 6, invuln: 0 };
        game.cart = { x: 78, y: GROUND - 45, vx: 0, hp: 8, maxHp: 8, invuln: 0 };
        game.location = 0;
        game.room = 1;
        game.won = false;
        game.zombies = spawnZombies(game.location, game.room);
        game.message = p.hp <= 0 ? 'Рестарт. Поймай тайминг парирования.' : 'Вагонетку сломали. Начинаем заново.';
        game.messageTimer = 2;
      }

      p.invuln = Math.max(0, p.invuln - dt);
      game.parryTimer = Math.max(0, game.parryTimer - dt);
      game.parryCooldown = Math.max(0, game.parryCooldown - dt);
      game.portalTimer = Math.max(0, game.portalTimer - dt);
      game.messageTimer = Math.max(0, game.messageTimer - dt);
      game.sparks = game.sparks
        .map((spark) => ({
          ...spark,
          x: spark.x + spark.vx * dt,
          y: spark.y + spark.vy * dt,
          vy: spark.vy + 320 * dt,
          life: spark.life - dt,
        }))
        .filter((spark) => spark.life > 0);
    };

    const draw = (time: number) => {
      const game = gameRef.current;
      drawBackground(time);
      drawPortal(time);
      drawCart();
      for (const zombie of game.zombies) drawZombie(zombie);
      drawPlayer();
      drawSparks();

      ctx.fillStyle = 'rgba(12, 12, 16, 0.54)';
      ctx.fillRect(18, 18, 360, 106);
      ctx.fillStyle = '#ffffff';
      ctx.font = '700 18px Inter, system-ui, sans-serif';
      ctx.fillText(`Room ${game.room}`, 34, 47);
      ctx.fillText(`Hero ${'|'.repeat(game.player.hp)}`, 34, 76);
      ctx.fillText(`Cart ${'|'.repeat(game.cart.hp)}`, 34, 105);
      ctx.fillText(`${locations[game.location].name}`, 176, 76);
      if (game.room % 5 === 0 && game.zombies.some((zombie) => zombie.kind === 'boss')) {
        ctx.fillStyle = '#ff3a54';
        ctx.fillText('BOSS', 296, 105);
      }
      ctx.fillStyle = game.parryCooldown > 0 ? '#7d8192' : '#fff36e';
      ctx.fillText(game.parryCooldown > 0 ? 'F cooling' : 'F parry ready', 176, 47);

      if (game.messageTimer > 0) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
        ctx.fillRect(WIDTH / 2 - 250, 28, 500, 42);
        ctx.fillStyle = '#f7f3df';
        ctx.font = '700 18px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(game.message, WIDTH / 2, 55);
        ctx.textAlign = 'left';
      }
    };

    const loop = (time: number) => {
      const dt = Math.min(0.033, (time - last) / 1000);
      last = time;
      frame += 1;
      update(dt);
      draw(time);
      const game = gameRef.current;
      setHud({
        hp: game.player.hp,
        cartHp: game.cart.hp,
        room: game.room,
        location: locations[game.location].name,
        zombies: game.zombies.length,
        boss: game.zombies.some((zombie) => zombie.kind === 'boss'),
        won: game.won,
        message: game.message,
      });
      requestAnimationFrame(loop);
    };

    const animation = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animation);
  }, []);

  return (
    <main className="game-shell">
      <section className="game-stage" aria-label="Carry a Parry game">
        <canvas ref={canvasRef} width={WIDTH} height={HEIGHT} />
        <div className="mobile-controls" aria-hidden="true">
          <button onPointerDown={() => (keysRef.current.left = true)} onPointerUp={() => (keysRef.current.left = false)} onPointerLeave={() => (keysRef.current.left = false)}>
            Left
          </button>
          <button onPointerDown={() => (keysRef.current.right = true)} onPointerUp={() => (keysRef.current.right = false)} onPointerLeave={() => (keysRef.current.right = false)}>
            Right
          </button>
          <button onPointerDown={() => (keysRef.current.jump = true)} onPointerUp={() => (keysRef.current.jump = false)} onPointerLeave={() => (keysRef.current.jump = false)}>
            Jump
          </button>
          <button onPointerDown={() => (keysRef.current.parry = true)} onPointerUp={() => (keysRef.current.parry = false)} onPointerLeave={() => (keysRef.current.parry = false)}>
            Parry
          </button>
          <button onPointerDown={() => (keysRef.current.portal = true)} onPointerUp={() => (keysRef.current.portal = false)} onPointerLeave={() => (keysRef.current.portal = false)}>
            Portal
          </button>
        </div>
      </section>

      <aside className="game-panel">
        <h1>Carry a Parry</h1>
        <div className="stats">
          <span>HP: {hud.hp}</span>
          <span>Cart: {hud.cartHp}</span>
          <span>Room: {hud.room}</span>
          <span>Location: {hud.location}</span>
          <span>{hud.boss ? 'Boss: alive' : `Zombies: ${hud.zombies}`}</span>
          <span>Goal: {hud.won ? 'finished' : `${Math.min(hud.room, FINAL_ROOM)}/${FINAL_ROOM}`}</span>
        </div>
        <div className="controls">
          <kbd>A</kbd><kbd>D</kbd><span>ходьба</span>
          <kbd>W</kbd><kbd>Space</kbd><span>прыжок</span>
          <kbd>F</kbd><span>парирование</span>
          <kbd>E</kbd><span>портал</span>
        </div>
        <p>{hud.message}</p>
      </aside>

      <aside className="auth-panel">
        <Auth />
      </aside>
    </main>
  );
}
