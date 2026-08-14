import { useEffect, useRef, useState } from 'react';
import { isSupabaseConfigured, supabase } from './lib/supabase';

type Keys = Record<string, boolean>;

type SkinId = 'default' | 'jotaro' | 'giorno' | 'pucci' | 'dio';

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
  specialCounter: number;
  specialDirection?: 'up' | 'down';
  specialVulnerable: boolean;
  kind: 'crawler' | 'runner' | 'brute' | 'shooter' | 'boss';
};

type Spark = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
};

type Projectile = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  damage: number;
  size: number;
  kind: 'star' | 'boulder' | 'acid' | 'acidStar' | 'neonBeam' | 'iceSpear' | 'iceSpike';
  targetX?: number;
  targetY?: number;
  target?: 'player' | 'cart';
  beamDirection?: 'up' | 'down';
  spearParryable?: boolean;
  activeDuration?: number;
  warning?: number;
  totalWarning?: number;
};

type GameAccount = {
  username: string;
  password?: string;
  role: 'player' | 'admin';
  parts: number;
  radiusLevel: number;
  parryColor: string;
  unlockedColors: string[];
  hasShotgun: boolean;
  savedRoom: number;
  ambushDefeated: boolean;
  defeatedFinalBoss: boolean;
  activeSkin: SkinId;
  unlockedSkins: SkinId[];
  provider?: 'local' | 'google';
};

type Profile = {
  username: string;
  role: 'player' | 'admin';
  accountId?: string;
};

const WIDTH = 960;
const HEIGHT = 540;
const GROUND = 405;
const PLAYER_W = 42;
const PLAYER_H = 74;
const FINAL_ROOM = 25;
const BUILD_LABEL = 'build: hitbox-v2';
const parryColors = [
  { name: 'Gold', color: '#fff36e', cost: 0 },
  { name: 'Toxic', color: '#80ff9e', cost: 3 },
  { name: 'Neon', color: '#ff65d8', cost: 5 },
  { name: 'Rift', color: '#57d5ff', cost: 7 },
];
const skins: Array<{ id: SkinId; name: string; stand: string; cost: number; body: string; coat: string; standColor: string }> = [
  { id: 'jotaro', name: 'Jotaro Kujo', stand: 'Star Platinum', cost: 100, body: '#1e2a5f', coat: '#10142b', standColor: '#9f7aff' },
  { id: 'giorno', name: 'Giorno Giovanna', stand: 'Gold Experience', cost: 200, body: '#f0c84b', coat: '#7b4bc8', standColor: '#ffd84d' },
  { id: 'pucci', name: 'Enrico Pucci', stand: 'Made in Heaven', cost: 300, body: '#f7f3df', coat: '#202028', standColor: '#d9f7ff' },
  { id: 'dio', name: 'DIO', stand: 'Za Warudo', cost: 400, body: '#f5c842', coat: '#101014', standColor: '#d6b84c' },
];
const chapterPalettes = [
  { sky: '#102236', far: '#2b4152', mid: '#4c3c4d', ground: '#6f5d46', accent: '#ffda67', hazard: '#d55b42' },
  { sky: '#13251c', far: '#27533d', mid: '#3b4b66', ground: '#40523a', accent: '#80ff9e', hazard: '#9cff57' },
  { sky: '#1b1531', far: '#40295d', mid: '#1f5b73', ground: '#52425b', accent: '#ff65d8', hazard: '#57d5ff' },
  { sky: '#d8efff', far: '#9bbfd3', mid: '#6f8fa4', ground: '#edf7ff', accent: '#57d5ff', hazard: '#b7e7ff' },
  { sky: '#ffe16a', far: '#e0b63a', mid: '#c7962a', ground: '#f1c84b', accent: '#fff7a8', hazard: '#ffd23f' },
];
const ACCOUNTS_KEY = 'carry-a-parry-accounts';

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
  {
    name: 'Snow Pass',
    sky: '#d8efff',
    far: '#9bbfd3',
    mid: '#6f8fa4',
    ground: '#edf7ff',
    accent: '#57d5ff',
    hazard: '#b7e7ff',
    decor: 'snow',
  },
  {
    name: 'Desert Wind',
    sky: '#ffe16a',
    far: '#e0b63a',
    mid: '#c7962a',
    ground: '#f1c84b',
    accent: '#fff7a8',
    hazard: '#ffd23f',
    decor: 'wind',
  },
];

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function chapterPalette(room: number) {
  return chapterPalettes[clamp(Math.floor((room - 1) / 5), 0, chapterPalettes.length - 1)];
}

function isShopRoom(room: number) {
  return room % 1 !== 0;
}

function isAmbushBossRoom(room: number) {
  return room === 20.5;
}

function isBossRoom(room: number) {
  return Number.isInteger(room) && room % 5 === 0;
}

function hasCart(room: number) {
  return room < 16 || room >= 21;
}

function isSnowRoom(room: number) {
  return room >= 16 && room <= 20.5;
}

function isDesertRoom(room: number) {
  return room >= 21 && room <= 25;
}

function isDioQuestRoom(room: number) {
  return Number.isInteger(room) && room >= 21 && room <= 24;
}

function chapterStartRoom(room: number) {
  if (!Number.isFinite(room)) return 1;
  if (Math.floor(room) === 21) return 21;
  if (isShopRoom(room)) {
    return clamp(room, 1, FINAL_ROOM);
  }
  return 1;
}

function safeCheckpointRoom(checkpointRoom: number | undefined, currentRoom: number) {
  if (typeof checkpointRoom === 'number' && Number.isFinite(checkpointRoom)) return chapterStartRoom(checkpointRoom);
  return chapterStartRoom(currentRoom);
}

function displayRoom(room: number) {
  return Number.isInteger(room) ? String(room) : room.toFixed(1);
}

function rectsOverlap(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function playerHurtBox(player: { x: number; y: number; crouching?: boolean }) {
  if (player.crouching) {
    return {
      x: player.x + 8,
      y: player.y + 38,
      w: 29,
      h: 36,
    };
  }
  return {
    x: player.x + 10,
    y: player.y + 2,
    w: 25,
    h: 72,
  };
}

function cartHurtBox(cart: { x: number; y: number }) {
  return {
    x: cart.x + 5,
    y: cart.y - 2,
    w: 102,
    h: 62,
  };
}

function rectCenter(rect: { x: number; y: number; w: number; h: number }) {
  return {
    x: rect.x + rect.w / 2,
    y: rect.y + rect.h / 2,
  };
}

function keyName(event: KeyboardEvent) {
  const codeMap: Record<string, string> = {
    KeyA: 'left',
    KeyD: 'right',
    KeyW: 'jump',
    ArrowLeft: 'left',
    ArrowRight: 'right',
    ArrowUp: 'jump',
    ArrowDown: 'down',
    KeyS: 'down',
    Space: 'jump',
    KeyF: 'parry',
    KeyE: 'portal',
    KeyR: 'flame',
  };

  return codeMap[event.code] ?? event.key.toLowerCase();
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName) || target.isContentEditable;
}

function readAccounts(): GameAccount[] {
  try {
    const accounts = JSON.parse(localStorage.getItem(ACCOUNTS_KEY) ?? '[]') as Partial<GameAccount>[];
    return accounts
      .filter((account): account is Partial<GameAccount> & { username: string } => Boolean(account.username))
      .map((account) => ({
        username: account.username,
        password: account.password,
        role: account.role === 'admin' ? 'admin' : 'player',
        parts: account.parts ?? 0,
        radiusLevel: account.radiusLevel ?? 0,
        parryColor: account.parryColor ?? parryColors[0].color,
        unlockedColors: account.unlockedColors?.length ? account.unlockedColors : [parryColors[0].color],
        hasShotgun: account.hasShotgun ?? false,
        savedRoom: account.savedRoom ?? 1,
        ambushDefeated: account.ambushDefeated ?? false,
        defeatedFinalBoss: account.defeatedFinalBoss ?? false,
        activeSkin: account.activeSkin ?? 'default',
        unlockedSkins: account.unlockedSkins?.length ? account.unlockedSkins as SkinId[] : ['default'],
        provider: account.provider ?? 'local',
      }));
  } catch {
    return [];
  }
}

function writeAccounts(accounts: GameAccount[]) {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}

function zombieStats(kind: Zombie['kind'], room: number) {
  const roomBoost = Math.floor((room - 1) / 3);
  if (kind === 'boss') {
    const hp = 16 + Math.floor(room / 5) * 6;
    return { hp: room === 15 ? Math.round(hp * 1.5) : hp, speed: 44 };
  }
  if (kind === 'shooter') return { hp: 2 + roomBoost, speed: 34 };
  if (kind === 'runner') return { hp: 2 + roomBoost, speed: 82 };
  if (kind === 'brute') return { hp: 5 + roomBoost, speed: 42 };
  return { hp: 3 + roomBoost, speed: 56 };
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
    specialCounter: 0,
    specialDirection: undefined,
    specialVulnerable: false,
    kind,
  };
}

function spawnZombies(locationIndex: number, room: number): Zombie[] {
  if (isShopRoom(room)) return [];
  if (isBossRoom(room)) {
    const boss = createZombie('boss', 700, room, 0);
    return [boss];
  }

  const count = clamp(2 + Math.floor((room - 1) / 2), 2, 7);
  const kinds: Zombie['kind'][] = ['crawler', 'runner', 'shooter', 'crawler', 'brute', 'runner', 'shooter'];
  const dioQuestKinds: Zombie['kind'][] = ['crawler', 'runner', 'brute', 'crawler', 'runner', 'brute', 'shooter'];

  return Array.from({ length: count }, (_, index) => {
    const kind = isDioQuestRoom(room) ? dioQuestKinds[index % dioQuestKinds.length] : kinds[(index + room + locationIndex) % kinds.length];
    const side = index % 2 === 0 ? 1 : -1;
    const x = isDioQuestRoom(room) && kind === 'shooter' ? WIDTH / 2 - 20 : side > 0 ? 620 + index * 54 : 370 - index * 32;
    const zombie = createZombie(kind, x, room, index);
    zombie.vx = side * -zombieStats(kind, room).speed;
    return zombie;
  });
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const keysRef = useRef<Keys>({});
  const profileRef = useRef<Profile | null>(null);
  const gameRef = useRef({
    player: { x: 170, y: GROUND - PLAYER_H, vx: 0, vy: 0, facing: 1, hp: 6, invuln: 0, crouching: false },
    cart: { x: 78, y: GROUND - 45, vx: 0, hp: 8, maxHp: 8, invuln: 0 },
    zombies: spawnZombies(0, 1),
    projectiles: [] as Projectile[],
    sparks: [] as Spark[],
    portalTimer: 0,
    location: 0,
    room: 1,
    checkpointRoom: 1,
    parryTimer: 0,
    parryCooldown: 0,
    hitStop: 0,
    won: false,
    paused: true,
    coins: 0,
    radiusLevel: 0,
    parryColor: parryColors[0].color,
    unlockedColors: [parryColors[0].color],
    hasShotgun: false,
    flameTimer: 0,
    flameCooldown: 0,
    snowCutscene: 'none' as 'none' | 'walk' | 'fall' | 'warning',
    snowCutsceneTimer: 0,
    frostVictoryCutscene: 'none' as 'none' | 'rise' | 'returned',
    frostVictoryCutsceneTimer: 0,
    ambushTriggered: false,
    ambushZoomTimer: 0,
    ambushDefeated: false,
    defeatedFinalBoss: false,
    activeSkin: 'default' as SkinId,
    unlockedSkins: ['default'] as SkinId[],
    roomRewarded: false,
    showHitboxes: false,
    freezeMobs: false,
    dioQuestRooms: [] as number[],
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
    coins: 0,
    radiusLevel: 0,
    parryColor: parryColors[0].color,
    hasShotgun: false,
    activeSkin: 'default' as SkinId,
    defeatedFinalBoss: false,
    showHitboxes: false,
    freezeMobs: false,
    message: 'Комната 1. Защищай вагонетку и чисти путь.',
  });
  const [menu, setMenu] = useState<'main' | 'shop' | 'closed'>('main');
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [authForm, setAuthForm] = useState({ username: '', password: '' });
  const [authMessage, setAuthMessage] = useState('');
  const [adminRoom, setAdminRoom] = useState('1');

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    const loadGoogleProfile = async () => {
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;
      if (!user?.email) return;

      const username = `google:${user.email}`;
      const accounts = readAccounts();
      let account = accounts.find((item) => item.username === username);
      if (!account) {
        account = {
          username,
          role: 'player',
          parts: gameRef.current.coins,
          radiusLevel: gameRef.current.radiusLevel,
	          parryColor: gameRef.current.parryColor,
	          unlockedColors: gameRef.current.unlockedColors,
		          hasShotgun: gameRef.current.hasShotgun,
		          savedRoom: gameRef.current.checkpointRoom,
		          ambushDefeated: gameRef.current.ambushDefeated,
		          defeatedFinalBoss: gameRef.current.defeatedFinalBoss,
		          activeSkin: gameRef.current.activeSkin,
		          unlockedSkins: gameRef.current.unlockedSkins,
		          provider: 'google',
	        };
        writeAccounts([...accounts, account]);
      }
      applyAccountProgress(account);
      setProfile({ username: user.user_metadata?.full_name ?? user.email, role: 'player', accountId: username });
      setAuthMessage('Signed in with Google.');
    };

    void loadGoogleProfile();
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const email = session?.user.email;
      if (!email) return;
      const username = `google:${email}`;
      const accounts = readAccounts();
      let account = accounts.find((item) => item.username === username);
      if (!account) {
        account = {
          username,
          role: 'player',
          parts: gameRef.current.coins,
          radiusLevel: gameRef.current.radiusLevel,
	          parryColor: gameRef.current.parryColor,
	          unlockedColors: gameRef.current.unlockedColors,
		          hasShotgun: gameRef.current.hasShotgun,
		          savedRoom: gameRef.current.checkpointRoom,
		          ambushDefeated: gameRef.current.ambushDefeated,
		          defeatedFinalBoss: gameRef.current.defeatedFinalBoss,
		          activeSkin: gameRef.current.activeSkin,
		          unlockedSkins: gameRef.current.unlockedSkins,
		          provider: 'google',
	        };
        writeAccounts([...accounts, account]);
      }
      applyAccountProgress(account);
      setProfile({ username: session.user.user_metadata?.full_name ?? email, role: 'player', accountId: username });
      setAuthMessage('Signed in with Google.');
    });

    return () => data.subscription.unsubscribe();
  }, []);

  const startGame = () => {
    gameRef.current.paused = false;
    setMenu('closed');
  };

  const openMenu = () => {
    gameRef.current.paused = true;
    setMenu('main');
  };

  const saveProgress = (username: string | undefined, saveCheckpoint = true) => {
    if (!username || username === 'admin') return;
    const game = gameRef.current;
    const accounts = readAccounts();
    writeAccounts(
      accounts.map((account) =>
        account.username === username
          ? {
              ...account,
              parts: game.coins,
              radiusLevel: game.radiusLevel,
	              parryColor: game.parryColor,
	              unlockedColors: game.unlockedColors,
		              hasShotgun: game.hasShotgun,
		              savedRoom: saveCheckpoint ? game.checkpointRoom : account.savedRoom,
		              ambushDefeated: game.ambushDefeated,
		              defeatedFinalBoss: game.defeatedFinalBoss,
		              activeSkin: game.activeSkin,
		              unlockedSkins: game.unlockedSkins,
		            }
          : account,
      ),
    );
  };

  const applyAccountProgress = (account: GameAccount) => {
    const game = gameRef.current;
    const room = account.ambushDefeated && account.savedRoom === 20.5 ? 21 : safeCheckpointRoom(account.savedRoom, 1);
    game.coins = account.parts;
    game.radiusLevel = account.radiusLevel;
    game.parryColor = account.parryColor;
    game.unlockedColors = account.unlockedColors;
    game.hasShotgun = account.hasShotgun;
    game.ambushDefeated = account.ambushDefeated;
    game.defeatedFinalBoss = account.defeatedFinalBoss;
    game.activeSkin = account.activeSkin;
    game.unlockedSkins = account.unlockedSkins;
    game.room = room;
    game.checkpointRoom = room;
    game.location = (Math.floor(room) - 1) % locations.length;
    game.player = { x: 170, y: GROUND - PLAYER_H, vx: 0, vy: 0, facing: 1, hp: 6, invuln: 0, crouching: false };
    game.cart = { x: 78, y: GROUND - 45, vx: 0, hp: 8, maxHp: 8, invuln: 0 };
    game.zombies = spawnZombies(game.location, game.room);
    game.projectiles = [];
    game.sparks = [];
    game.roomRewarded = false;
    game.snowCutscene = 'none';
    game.snowCutsceneTimer = 0;
    game.frostVictoryCutscene = 'none';
    game.frostVictoryCutsceneTimer = 0;
    game.ambushTriggered = false;
    game.ambushZoomTimer = 0;
    game.message = `Сохранка биома: старт с комнаты ${room}.`;
    game.messageTimer = 2;
    setHud((current) => ({
      ...current,
      coins: account.parts,
      radiusLevel: account.radiusLevel,
      parryColor: account.parryColor,
      hasShotgun: account.hasShotgun,
      activeSkin: account.activeSkin,
      defeatedFinalBoss: account.defeatedFinalBoss,
      room: game.room,
      location: locations[game.location].name,
      zombies: game.zombies.length,
    }));
  };

  const signInWithGoogle = async () => {
    if (!isSupabaseConfigured) {
      setAuthMessage('Сначала вставь Supabase URL и key в .env.');
      return;
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) setAuthMessage(error.message);
  };

  const buyRadius = () => {
    const game = gameRef.current;
    const cost = 4 + game.radiusLevel * 3;
    if (game.radiusLevel >= 5 || game.coins < cost) return;
    game.coins -= cost;
    game.radiusLevel += 1;
    game.message = `Радиус парирования +${game.radiusLevel}`;
    game.messageTimer = 1.4;
    saveProgress(profile?.accountId ?? profile?.username);
    setHud((current) => ({ ...current, coins: game.coins, radiusLevel: game.radiusLevel }));
  };

  const buyColor = (color: string, cost: number) => {
    const game = gameRef.current;
    if (!game.unlockedColors.includes(color)) {
      if (game.coins < cost) return;
      game.coins -= cost;
      game.unlockedColors.push(color);
    }
    game.parryColor = color;
    game.message = 'Цвет парирования выбран.';
    game.messageTimer = 1.2;
    saveProgress(profile?.accountId ?? profile?.username);
    setHud((current) => ({ ...current, coins: game.coins, parryColor: color }));
  };

  const buyHeal = () => {
    const game = gameRef.current;
    const cost = 6;
    if (!isShopRoom(game.room)) return;
    if (game.coins < cost || game.player.hp >= 6) return;
    game.coins -= cost;
    game.player.hp = Math.min(6, game.player.hp + 3);
    game.message = 'Healed +3 HP';
    game.messageTimer = 1.2;
    saveProgress(profile?.accountId ?? profile?.username);
    setHud((current) => ({ ...current, coins: game.coins, hp: game.player.hp }));
  };

  const buyShotgun = () => {
    const game = gameRef.current;
    const cost = 40;
    if (!isShopRoom(game.room)) return;
    if (game.hasShotgun || game.coins < cost) return;
    game.coins -= cost;
    game.hasShotgun = true;
    game.message = 'Shotgun unlocked';
    game.messageTimer = 1.2;
    saveProgress(profile?.accountId ?? profile?.username);
    setHud((current) => ({ ...current, coins: game.coins, hasShotgun: true }));
  };

  const buySkin = (skinId: SkinId, cost: number) => {
    const game = gameRef.current;
    if (!game.defeatedFinalBoss) return;
    if (skinId === 'dio' && !game.unlockedSkins.includes('dio')) {
      game.message = 'DIO открывается квестом: оставь стрелков в пустыне и победи босса.';
      game.messageTimer = 1.8;
      return;
    }
    if (!game.unlockedSkins.includes(skinId)) {
      if (game.coins < cost) return;
      game.coins -= cost;
      game.unlockedSkins.push(skinId);
    }
    game.activeSkin = skinId;
    game.message = 'Skin selected.';
    game.messageTimer = 1.2;
    saveProgress(profile?.accountId ?? profile?.username);
    setHud((current) => ({ ...current, coins: game.coins, activeSkin: skinId }));
  };

  const adminHeal = () => {
    const game = gameRef.current;
    game.player.hp = 6;
    game.cart.hp = game.cart.maxHp;
    game.player.invuln = 0.6;
    game.cart.invuln = 0.6;
    game.message = 'Admin heal: hero and cart restored.';
    game.messageTimer = 1.2;
    setHud((current) => ({ ...current, hp: game.player.hp, cartHp: game.cart.hp }));
  };

  const adminGiveShotgun = () => {
    const game = gameRef.current;
    game.hasShotgun = true;
    game.message = 'Admin shotgun unlocked.';
    game.messageTimer = 1.2;
    saveProgress(profile?.accountId ?? profile?.username);
    setHud((current) => ({ ...current, hasShotgun: true }));
  };

  const adminToggleFreezeMobs = () => {
    const game = gameRef.current;
    game.freezeMobs = !game.freezeMobs;
    game.message = game.freezeMobs ? 'Admin abuse: mobs frozen.' : 'Admin abuse: mobs unfrozen.';
    game.messageTimer = 1.2;
    setHud((current) => ({ ...current, freezeMobs: game.freezeMobs, message: game.message }));
  };

  const adminDefeatMobs = (keepShooters = false) => {
    const game = gameRef.current;
    let defeated = 0;
    for (const zombie of game.zombies) {
      if (zombie.hp <= 0) continue;
      if (keepShooters && zombie.kind === 'shooter') continue;
      zombie.hp = 0;
      defeated += 1;
    }
    game.message = keepShooters ? `Admin abuse: ${defeated} mobs down, shooters alive.` : `Admin abuse: ${defeated} mobs down.`;
    game.messageTimer = 1.2;
    setHud((current) => ({ ...current, message: game.message }));
  };

  const jumpToRoom = (roomValue: number) => {
    const room = clamp(Math.round(roomValue * 2) / 2, 1, FINAL_ROOM);
    const game = gameRef.current;
    game.room = room;
    game.location = (Math.floor(room) - 1) % locations.length;
    game.checkpointRoom = chapterStartRoom(room);
    game.player = { x: 170, y: GROUND - PLAYER_H, vx: 0, vy: 0, facing: 1, hp: 6, invuln: 0, crouching: false };
    game.cart = { x: 78, y: GROUND - 45, vx: 0, hp: 8, maxHp: 8, invuln: 0 };
    game.zombies = spawnZombies(game.location, game.room);
    game.projectiles = [];
    game.sparks = [];
    game.parryTimer = 0;
    game.parryCooldown = 0;
    game.flameTimer = 0;
    game.flameCooldown = 0;
    game.snowCutscene = 'none';
    game.snowCutsceneTimer = 0;
    game.frostVictoryCutscene = 'none';
    game.frostVictoryCutsceneTimer = 0;
    game.ambushTriggered = false;
    game.ambushZoomTimer = 0;
    game.dioQuestRooms = room === 21 ? [] : game.dioQuestRooms;
    game.hitStop = 0;
    game.won = false;
    game.roomRewarded = false;
    game.message = isShopRoom(room) ? `Admin jump: shop ${displayRoom(room)}` : isBossRoom(room) ? `Admin jump: boss room ${room}` : `Admin jump: room ${room}`;
    game.messageTimer = 2;
    game.paused = false;
    setMenu('closed');
    setHud((current) => ({
      ...current,
      hp: game.player.hp,
      cartHp: game.cart.hp,
      room: game.room,
      location: locations[game.location].name,
      zombies: game.zombies.length,
      boss: game.zombies.some((zombie) => zombie.kind === 'boss'),
      won: false,
      message: game.message,
    }));
  };

  const toggleHitboxes = () => {
    const game = gameRef.current;
    game.showHitboxes = !game.showHitboxes;
    setHud((current) => ({ ...current, showHitboxes: game.showHitboxes }));
  };

  const handleGameAuth = (event: React.FormEvent) => {
    event.preventDefault();
    const username = authForm.username.trim();
    const password = authForm.password;
    if (!username || !password) {
      setAuthMessage('Заполни логин и пароль.');
      return;
    }

    if (authMode === 'signin' && username === 'admin' && password === '1111') {
      const adminProfile = { username: 'admin', role: 'admin' as const };
      setProfile(adminProfile);
      gameRef.current.coins = Math.max(gameRef.current.coins, 999);
      setHud((current) => ({ ...current, coins: gameRef.current.coins }));
      setAuthMessage('Admin signed in.');
      return;
    }

    const accounts = readAccounts();
    if (authMode === 'signup') {
      if (username.toLowerCase() === 'admin' || accounts.some((account) => account.username.toLowerCase() === username.toLowerCase())) {
        setAuthMessage('Такой аккаунт уже есть.');
        return;
      }
      const account: GameAccount = {
        username,
        password,
        role: 'player',
        parts: gameRef.current.coins,
        radiusLevel: gameRef.current.radiusLevel,
        parryColor: gameRef.current.parryColor,
        unlockedColors: gameRef.current.unlockedColors,
        hasShotgun: gameRef.current.hasShotgun,
        savedRoom: gameRef.current.checkpointRoom,
        ambushDefeated: gameRef.current.ambushDefeated,
        defeatedFinalBoss: gameRef.current.defeatedFinalBoss,
        activeSkin: gameRef.current.activeSkin,
        unlockedSkins: gameRef.current.unlockedSkins,
      };
      writeAccounts([...accounts, account]);
      setProfile({ username, role: 'player' });
      setAuthMessage('Account created.');
      return;
    }

    const account = accounts.find((item) => item.username.toLowerCase() === username.toLowerCase() && item.password === password);
    if (!account) {
      setAuthMessage('Неверный логин или пароль.');
      return;
    }
    applyAccountProgress(account);
    setProfile({ username: account.username, role: account.role });
    setAuthMessage('Signed in.');
  };

  const signOut = async () => {
    if (isSupabaseConfigured) await supabase.auth.signOut();
    setProfile(null);
    setAuthMessage('');
    setAuthForm({ username: '', password: '' });
  };

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
    let visualTime = last;

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
      if (game.room >= FINAL_ROOM && isShopRoom(game.room)) {
        game.won = true;
        game.message = 'Финал: 25 комнат пройдены. Снежный перевал позади.';
        game.messageTimer = 99;
        addSparks(WIDTH / 2, GROUND - 145, '#fff36e', 80);
        return;
      }
      game.room = isBossRoom(game.room) ? game.room + 0.5 : Math.floor(game.room) + 1;
      if (game.room === 21) {
        game.dioQuestRooms = [];
      }
      game.location = (Math.floor(game.room) - 1) % locations.length;
      game.player.x = 130;
      game.cart.x = 40;
      if (hasCart(game.room)) {
        game.cart.hp = Math.min(game.cart.maxHp, game.cart.hp + 2);
      }
      game.zombies = spawnZombies(game.location, game.room);
      game.projectiles = [];
      game.roomRewarded = false;
      game.ambushTriggered = false;
      game.ambushZoomTimer = 0;
      game.frostVictoryCutscene = 'none';
      game.frostVictoryCutsceneTimer = 0;
      game.portalTimer = 0.7;
      game.message = isShopRoom(game.room)
        ? `Магазин ${displayRoom(game.room)}: закупись перед дорогой.`
        : isBossRoom(game.room)
          ? `БОСС ${game.room / 5}: ${locations[game.location].name}`
          : `Комната ${game.room}: ${locations[game.location].name}`;
      if (game.room === 16) {
        game.player.x = 24;
        game.player.y = GROUND - PLAYER_H;
        game.player.vx = 0;
        game.player.vy = 0;
        game.zombies = [];
        game.snowCutscene = 'walk';
        game.snowCutsceneTimer = 0;
        game.message = '...';
      }
      if (isAmbushBossRoom(game.room)) {
        game.zombies = [];
        game.message = game.ambushDefeated ? 'Boss shop 20.5: rematch уже повержен.' : 'Boss shop 20.5: слишком тихо... иди к середине комнаты.';
      }
      game.messageTimer = 2.8;
      addSparks(850, GROUND - 80, chapterPalette(game.room).accent, 36);
      if (isShopRoom(game.room) && !isAmbushBossRoom(game.room)) {
        game.checkpointRoom = game.room;
        game.message = `Магазин ${displayRoom(game.room)}: waypoint ${displayRoom(game.checkpointRoom)} сохранен.`;
        saveProgress(profileRef.current?.accountId ?? profileRef.current?.username);
        game.paused = true;
        setMenu('shop');
      }
    };

    const drawBossLayout = (room: number, time: number) => {
      const bossIndex = Math.floor(room / 5);
      const palette = chapterPalette(room);
      ctx.fillStyle = palette.hazard;
      ctx.globalAlpha = 0.88;

      if (bossIndex === 1) {
        for (const x of [130, 300, 610, 780]) {
          ctx.fillRect(x, GROUND - 172, 24, 172);
          ctx.fillRect(x - 18, GROUND - 178, 60, 10);
        }
      } else if (bossIndex === 2) {
        for (const x of [105, 255, 405, 555, 705]) {
          ctx.fillRect(x, GROUND - 235, 110, 10);
          ctx.fillRect(x + 14, GROUND - 235, 8, 150);
          ctx.fillRect(x + 88, GROUND - 235, 8, 150);
        }
      } else if (bossIndex === 3) {
        for (let i = 0; i < 6; i += 1) {
          const x = 70 + i * 155;
          ctx.fillRect(x, GROUND - 76 - (i % 2) * 48, 112, 14);
          ctx.fillRect(x + 92, GROUND - 132 - (i % 2) * 48, 18, 70);
          ctx.fillRect(x + 10, GROUND - 210, 12, 92);
        }
      } else if (bossIndex === 4) {
        for (const x of [85, 180, 345, 510, 675, 810]) {
          ctx.beginPath();
          ctx.moveTo(x, GROUND);
          ctx.lineTo(x + 35, GROUND - 82);
          ctx.lineTo(x + 70, GROUND);
          ctx.closePath();
          ctx.fill();
        }
      } else {
        for (let i = 0; i < 9; i += 1) {
          const angle = (Math.PI * 2 * i) / 9 + time * 0.0004;
          const x = WIDTH / 2 + Math.cos(angle) * 320;
          const y = GROUND - 125 + Math.sin(angle) * 48;
          ctx.fillRect(x - 13, y - 45, 26, 90);
          ctx.fillRect(x - 36, y - 52, 72, 11);
        }
      }

      ctx.globalAlpha = 1;
    };

    const drawBackground = (time: number) => {
      const game = gameRef.current;
      const bossRoom = isBossRoom(game.room);
      const shopRoom = isShopRoom(game.room);
      const baseLoc = locations[game.location];
      const loc = chapterPalette(game.room);
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
      if (bossRoom) {
        drawBossLayout(game.room, time);
      } else if (shopRoom) {
        ctx.fillStyle = loc.hazard;
        for (const x of [170, 380, 590, 800]) {
          ctx.fillRect(x, GROUND - 150, 24, 150);
          ctx.fillRect(x - 34, GROUND - 154, 92, 12);
          ctx.fillRect(x - 20, GROUND - 104, 64, 9);
        }
      } else if (baseLoc.decor === 'cranes') {
        for (let i = 0; i < 4; i += 1) {
          const x = 95 + i * 225 - ((time * 0.018) % 90);
          ctx.fillRect(x, GROUND - 215, 10, 145);
          ctx.fillRect(x - 44, GROUND - 218, 98, 8);
          ctx.fillRect(x + 46, GROUND - 218, 5, 52);
        }
      } else if (baseLoc.decor === 'pipes') {
        for (let i = 0; i < 6; i += 1) {
          const x = 40 + i * 165;
          ctx.fillRect(x, GROUND - 98 - (i % 2) * 24, 128, 14);
          ctx.fillRect(x + 108, GROUND - 98 - (i % 2) * 24, 14, 64);
        }
      } else if (baseLoc.decor === 'snow') {
        for (let i = 0; i < 8; i += 1) {
          const x = 35 + i * 128 - ((time * 0.01) % 80);
          ctx.beginPath();
          ctx.moveTo(x, GROUND);
          ctx.lineTo(x + 48, GROUND - 96 - (i % 3) * 20);
          ctx.lineTo(x + 102, GROUND);
          ctx.closePath();
          ctx.fill();
        }
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = 0.72;
        for (let i = 0; i < 42; i += 1) {
          const x = (i * 67 + (time * 0.018)) % WIDTH;
          const y = 28 + ((i * 43 + time * 0.026) % (GROUND - 55));
          ctx.fillRect(x, y, 3 + (i % 3), 3 + (i % 2));
        }
        ctx.globalAlpha = 0.78;
        ctx.fillStyle = loc.hazard;
      } else if (baseLoc.decor === 'wind') {
        ctx.fillStyle = 'rgba(255, 247, 168, 0.55)';
        for (let i = 0; i < 6; i += 1) {
          const x = i * 188 - ((time * 0.006) % 188);
          ctx.beginPath();
          ctx.moveTo(x - 44, GROUND - 58);
          ctx.quadraticCurveTo(x + 68, GROUND - 156 - (i % 2) * 18, x + 206, GROUND - 58);
          ctx.closePath();
          ctx.fill();
        }
        ctx.fillStyle = 'rgba(255, 237, 125, 0.72)';
        for (let i = 0; i < 5; i += 1) {
          const x = 62 + i * 205 - ((time * 0.01) % 205);
          const peak = GROUND - 192 - (i % 2) * 24;
          ctx.beginPath();
          ctx.moveTo(x - 58, GROUND - 48);
          ctx.lineTo(x + 28, peak);
          ctx.lineTo(x + 118, GROUND - 48);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = 'rgba(218, 169, 47, 0.36)';
          ctx.beginPath();
          ctx.moveTo(x + 28, peak);
          ctx.lineTo(x + 118, GROUND - 48);
          ctx.lineTo(x + 42, GROUND - 48);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = 'rgba(255, 237, 125, 0.72)';
        }
        ctx.fillStyle = 'rgba(224, 173, 48, 0.62)';
        for (let i = 0; i < 6; i += 1) {
          const x = -50 + i * 190 - ((time * 0.016) % 190);
          ctx.beginPath();
          ctx.moveTo(x - 80, GROUND - 18);
          ctx.quadraticCurveTo(x + 40, GROUND - 118 - (i % 3) * 15, x + 230, GROUND - 18);
          ctx.lineTo(x + 230, GROUND);
          ctx.lineTo(x - 80, GROUND);
          ctx.closePath();
          ctx.fill();
        }
        for (let i = 0; i < 4; i += 1) {
          const x = 95 + i * 235;
          const y = GROUND - 142 - (i % 2) * 24;
          ctx.fillRect(x - 7, y, 14, 142);
          ctx.beginPath();
          ctx.arc(x, y, 9, 0, Math.PI * 2);
          ctx.fill();
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(time * 0.003 + i);
          for (let blade = 0; blade < 4; blade += 1) {
            ctx.rotate(Math.PI / 2);
            ctx.fillRect(0, -5, 58, 10);
            ctx.fillRect(42, -11, 22, 22);
          }
          ctx.restore();
        }
        ctx.strokeStyle = '#fff7a8';
        ctx.lineWidth = 3;
        ctx.globalAlpha = 0.52;
        for (let i = 0; i < 12; i += 1) {
          const x = (i * 94 + time * 0.075) % (WIDTH + 140) - 120;
          const y = 44 + ((i * 39 + time * 0.026) % (GROUND - 78));
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.quadraticCurveTo(x + 48, y - 24, x + 112, y - 2);
          ctx.stroke();
        }
        ctx.strokeStyle = '#ffe88a';
        ctx.globalAlpha = 0.42;
        for (let i = 0; i < 8; i += 1) {
          const x = (i * 126 + time * 0.045) % WIDTH;
          const y = GROUND - 76 - (i % 4) * 34;
          ctx.beginPath();
          ctx.arc(x, y, 18 + (i % 3) * 8, 0.2, Math.PI * 1.55);
          ctx.stroke();
        }
        ctx.fillStyle = '#fff2a6';
        ctx.globalAlpha = 0.64;
        for (let i = 0; i < 32; i += 1) {
          const x = (i * 53 + time * 0.095) % WIDTH;
          const y = 58 + ((i * 31 + time * 0.026) % (GROUND - 70));
          ctx.fillRect(x, y, 10 + (i % 4) * 4, 2);
        }
        ctx.globalAlpha = 0.78;
        ctx.fillStyle = loc.hazard;
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

      if (bossRoom) {
        ctx.globalAlpha = 0.2;
        ctx.fillStyle = loc.accent;
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
        ctx.globalAlpha = 1;
        ctx.fillStyle = loc.accent;
        ctx.font = '900 28px Inter, system-ui, sans-serif';
        ctx.fillText(`BOSS ROOM ${game.room} - ARENA ${game.room / 5}`, 34, GROUND - 305);
      } else if (shopRoom) {
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = loc.accent;
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
        ctx.globalAlpha = 1;
        ctx.fillStyle = loc.accent;
        ctx.font = '900 28px Inter, system-ui, sans-serif';
        ctx.fillText(`SHOP ROOM ${displayRoom(game.room)}`, 34, GROUND - 305);
      }
    };

    const drawPortal = (time: number) => {
      const game = gameRef.current;
      const loc = chapterPalette(game.room);
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
      if (!hasCart(gameRef.current.room)) return;
      const wheelSpin = cart.x * 0.12;
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
      ctx.strokeStyle = '#8f94a3';
      ctx.lineWidth = 3;
      for (const wheelX of [cart.x + 24, cart.x + 86]) {
        ctx.save();
        ctx.translate(wheelX, cart.y + 43);
        ctx.rotate(wheelSpin);
        ctx.beginPath();
        ctx.moveTo(-10, 0);
        ctx.lineTo(10, 0);
        ctx.moveTo(0, -10);
        ctx.lineTo(0, 10);
        ctx.stroke();
        ctx.restore();
      }
      ctx.fillStyle = '#9da7b7';
      ctx.fillRect(cart.x + 25, cart.y - 12, 42, 14);

      if (gameRef.current.showHitboxes) {
        const hurtBox = cartHurtBox(cart);
        ctx.strokeStyle = 'rgba(255, 46, 86, 0.95)';
        ctx.lineWidth = 2;
        ctx.strokeRect(hurtBox.x, hurtBox.y, hurtBox.w, hurtBox.h);
      }
    };

    const drawPlayer = () => {
      const { player, parryTimer, parryCooldown, parryColor, radiusLevel, activeSkin } = gameRef.current;
      const skin = skins.find((item) => item.id === activeSkin);
      const parryRadius = 48 + radiusLevel * 6;
      const cx = player.x + PLAYER_W / 2;
      const running = Math.abs(player.vx) > 8 && player.y >= GROUND - PLAYER_H - 1 && !player.crouching;
      const step = running ? Math.sin(frame * 0.34) : 0;
      const bob = player.crouching ? 0 : running ? Math.abs(step) * -3 : Math.sin(frame * 0.08) * 1.2;
      const armSwing = running ? step * 7 : Math.sin(frame * 0.08) * 2;
      ctx.save();
      ctx.translate(cx, player.y + bob);
      ctx.scale(player.facing, 1);
      ctx.translate(-cx, -player.y);
      if (skin) {
        const standX = player.x - 42;
        const standY = player.y + (player.crouching ? 18 : 0);
        ctx.globalAlpha = 0.62;
        ctx.shadowColor = skin.standColor;
        ctx.shadowBlur = 16;
        if (activeSkin === 'jotaro') {
          ctx.fillStyle = '#6f46d8';
          ctx.fillRect(standX + 8, standY + 22, 30, 34);
          ctx.fillStyle = '#8d63ff';
          ctx.fillRect(standX + 13, standY + 2, 23, 24);
          ctx.fillStyle = '#2fce8a';
          ctx.fillRect(standX + 11, standY + 18, 8, 28);
          ctx.fillRect(standX + 30, standY + 18, 8, 28);
          ctx.fillStyle = '#f0d36b';
          ctx.fillRect(standX + 18, standY - 2, 15, 5);
          ctx.fillRect(standX + 17, standY + 25, 12, 4);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(standX + 18, standY + 10, 4, 4);
          ctx.fillRect(standX + 29, standY + 10, 4, 4);
        } else if (activeSkin === 'giorno') {
          ctx.fillStyle = '#ffd84d';
          ctx.fillRect(standX + 10, standY + 21, 26, 36);
          ctx.fillRect(standX + 12, standY + 4, 22, 22);
          ctx.fillStyle = '#7adf74';
          ctx.fillRect(standX + 8, standY + 28, 7, 20);
          ctx.fillRect(standX + 31, standY + 28, 7, 20);
          ctx.fillStyle = '#c74cff';
          ctx.fillRect(standX + 15, standY + 24, 18, 5);
          ctx.beginPath();
          ctx.arc(standX + 23, standY + 15, 15, 0, Math.PI * 2);
          ctx.strokeStyle = '#c74cff';
          ctx.lineWidth = 3;
          ctx.stroke();
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(standX + 17, standY + 11, 4, 4);
          ctx.fillRect(standX + 28, standY + 11, 4, 4);
        } else if (activeSkin === 'pucci') {
          ctx.strokeStyle = '#9defff';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(standX + 27, standY + 33, 28, -1.35, 1.1);
          ctx.stroke();
          ctx.strokeStyle = '#f7fbff';
          ctx.lineWidth = 5;
          ctx.beginPath();
          ctx.moveTo(standX + 20, standY + 17);
          ctx.quadraticCurveTo(standX + 10, standY + 32, standX + 13, standY + 53);
          ctx.moveTo(standX + 32, standY + 18);
          ctx.quadraticCurveTo(standX + 42, standY + 33, standX + 38, standY + 53);
          ctx.stroke();
          ctx.fillStyle = '#f7fbff';
          ctx.beginPath();
          ctx.ellipse(standX + 26, standY + 32, 18, 24, -0.06, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#d9f7ff';
          ctx.beginPath();
          ctx.ellipse(standX + 27, standY + 8, 14, 19, -0.18, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#161820';
          ctx.fillRect(standX + 16, standY + 25, 6, 28);
          ctx.fillRect(standX + 31, standY + 25, 6, 28);
          ctx.fillRect(standX + 20, standY + 36, 15, 5);
          ctx.fillStyle = '#ff304d';
          ctx.beginPath();
          ctx.moveTo(standX + 28, standY - 11);
          ctx.lineTo(standX + 39, standY + 5);
          ctx.lineTo(standX + 18, standY + 4);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = '#9defff';
          ctx.fillRect(standX + 12, standY + 56, 31, 4);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(standX + 21, standY + 7, 4, 4);
          ctx.fillRect(standX + 31, standY + 7, 4, 4);
          ctx.strokeStyle = '#161820';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(standX + 28, standY + 13, 7, 0, Math.PI * 2);
          ctx.moveTo(standX + 28, standY + 13);
          ctx.lineTo(standX + 28, standY + 8);
          ctx.moveTo(standX + 28, standY + 13);
          ctx.lineTo(standX + 33, standY + 15);
          ctx.stroke();
          ctx.fillStyle = '#161820';
          ctx.beginPath();
          ctx.ellipse(standX + 15, standY + 61, 8, 4, -0.15, 0, Math.PI * 2);
          ctx.ellipse(standX + 39, standY + 61, 8, 4, 0.15, 0, Math.PI * 2);
          ctx.fill();
        } else if (activeSkin === 'dio') {
          ctx.fillStyle = '#d6b84c';
          ctx.fillRect(standX + 8, standY + 19, 31, 38);
          ctx.fillStyle = '#f3d66a';
          ctx.fillRect(standX + 12, standY + 2, 25, 23);
          ctx.fillStyle = '#6f5a27';
          ctx.fillRect(standX + 16, standY + 25, 18, 20);
          ctx.fillStyle = '#2f9b5c';
          ctx.beginPath();
          ctx.moveTo(standX + 23, standY + 31);
          ctx.bezierCurveTo(standX + 14, standY + 22, standX + 10, standY + 36, standX + 23, standY + 43);
          ctx.bezierCurveTo(standX + 36, standY + 36, standX + 32, standY + 22, standX + 23, standY + 31);
          ctx.fill();
          ctx.fillStyle = '#101014';
          ctx.fillRect(standX + 7, standY + 26, 7, 27);
          ctx.fillRect(standX + 34, standY + 26, 7, 27);
          ctx.fillRect(standX + 18, standY + 53, 7, 12);
          ctx.fillRect(standX + 29, standY + 53, 7, 12);
          ctx.fillStyle = '#7d6a32';
          ctx.fillRect(standX + 9, standY + 17, 30, 5);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(standX + 18, standY + 10, 4, 4);
          ctx.fillRect(standX + 30, standY + 10, 4, 4);
          ctx.strokeStyle = '#101014';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(standX + 25, standY + 14, 8, 0, Math.PI * 2);
          ctx.moveTo(standX + 25, standY + 14);
          ctx.lineTo(standX + 25, standY + 7);
          ctx.moveTo(standX + 25, standY + 14);
          ctx.lineTo(standX + 31, standY + 17);
          ctx.stroke();
          ctx.fillStyle = '#f7f0df';
          ctx.fillRect(standX + 14, standY - 4, 22, 5);
          ctx.fillRect(standX + 18, standY - 9, 14, 5);
        }
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
      }
      const armColor =
        activeSkin === 'jotaro'
          ? '#10142b'
          : activeSkin === 'giorno'
            ? '#d86ecf'
            : activeSkin === 'pucci'
              ? '#f7f3df'
              : activeSkin === 'dio'
                ? '#f5c842'
                : '#5eb9d8';
      const legColor = activeSkin === 'giorno' ? '#6b4cc2' : activeSkin === 'pucci' ? '#202028' : activeSkin === 'dio' ? '#d2a72f' : '#141419';
      ctx.strokeStyle = armColor;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(player.x + 13, player.y + 31);
      ctx.lineTo(player.x - 1, player.y + 40 + armSwing);
      ctx.moveTo(player.x + 32, player.y + 31);
      ctx.lineTo(player.x + 45, player.y + 39 - armSwing);
      ctx.stroke();
      ctx.fillStyle = player.invuln > 0 ? '#ffeff8' : skin?.body ?? '#8fe0ff';
      ctx.fillRect(player.x + 9, player.y + (player.crouching ? 34 : 18), 25, player.crouching ? 26 : 42);
      if (activeSkin === 'jotaro') {
        ctx.fillStyle = '#10142b';
        ctx.fillRect(player.x + 6, player.y + (player.crouching ? 34 : 18), 31, player.crouching ? 27 : 43);
        ctx.fillStyle = '#f0d36b';
        ctx.fillRect(player.x + 31, player.y + (player.crouching ? 38 : 24), 4, 4);
        ctx.fillRect(player.x + 33, player.y + (player.crouching ? 42 : 29), 4, 4);
        ctx.strokeStyle = '#f0d36b';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(player.x + 13, player.y + (player.crouching ? 40 : 25));
        ctx.quadraticCurveTo(player.x + 20, player.y + 36, player.x + 28, player.y + (player.crouching ? 43 : 35));
        ctx.stroke();
      } else if (activeSkin === 'giorno') {
        ctx.fillStyle = '#d86ecf';
        ctx.fillRect(player.x + 9, player.y + (player.crouching ? 34 : 18), 25, player.crouching ? 26 : 42);
        ctx.fillStyle = '#ffd84d';
        ctx.beginPath();
        ctx.arc(player.x + 17, player.y + (player.crouching ? 43 : 29), 5, 0, Math.PI * 2);
        ctx.arc(player.x + 28, player.y + (player.crouching ? 43 : 29), 5, 0, Math.PI * 2);
        ctx.arc(player.x + 22, player.y + (player.crouching ? 54 : 43), 4, 0, Math.PI * 2);
        ctx.fill();
      } else if (activeSkin === 'pucci') {
        ctx.fillStyle = '#202028';
        ctx.fillRect(player.x + 8, player.y + (player.crouching ? 34 : 18), 27, player.crouching ? 26 : 42);
        ctx.fillStyle = '#f7f3df';
        ctx.fillRect(player.x + 20, player.y + (player.crouching ? 37 : 22), 4, player.crouching ? 20 : 33);
        ctx.fillRect(player.x + 13, player.y + (player.crouching ? 45 : 33), 18, 4);
        ctx.fillStyle = '#d9f7ff';
        ctx.fillRect(player.x + 10, player.y + (player.crouching ? 56 : 50), 24, 3);
      } else if (activeSkin === 'dio') {
        const torsoY = player.y + (player.crouching ? 34 : 18);
        const torsoH = player.crouching ? 26 : 42;
        ctx.fillStyle = '#f5c842';
        ctx.fillRect(player.x + 7, torsoY, 29, torsoH);
        ctx.fillStyle = '#101014';
        ctx.beginPath();
        ctx.moveTo(player.x + 17, torsoY + 2);
        ctx.lineTo(player.x + 29, torsoY + 2);
        ctx.lineTo(player.x + 25, torsoY + 27);
        ctx.lineTo(player.x + 21, torsoY + 27);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#2f9b5c';
        ctx.beginPath();
        ctx.moveTo(player.x + 14, torsoY + 18);
        ctx.bezierCurveTo(player.x + 7, torsoY + 11, player.x + 5, torsoY + 23, player.x + 14, torsoY + 28);
        ctx.bezierCurveTo(player.x + 23, torsoY + 23, player.x + 21, torsoY + 11, player.x + 14, torsoY + 18);
        ctx.moveTo(player.x + 31, torsoY + 18);
        ctx.bezierCurveTo(player.x + 24, torsoY + 11, player.x + 22, torsoY + 23, player.x + 31, torsoY + 28);
        ctx.bezierCurveTo(player.x + 40, torsoY + 23, player.x + 38, torsoY + 11, player.x + 31, torsoY + 18);
        ctx.fill();
        ctx.fillStyle = '#7a6125';
        ctx.fillRect(player.x + 8, torsoY + torsoH - 8, 28, 5);
        ctx.fillStyle = '#2f9b5c';
        ctx.fillRect(player.x + 2, player.y + 39 + armSwing, 8, 5);
        ctx.fillRect(player.x + 37, player.y + 38 - armSwing, 8, 5);
      }
      ctx.fillStyle = '#f2c28f';
      ctx.fillRect(player.x + 10, player.y + (player.crouching ? 18 : 0), 24, 24);
      if (activeSkin === 'jotaro') {
        ctx.fillStyle = '#10142b';
        ctx.fillRect(player.x + 6, player.y + (player.crouching ? 11 : -7), 33, 12);
        ctx.fillRect(player.x + 11, player.y + (player.crouching ? 6 : -12), 22, 8);
        ctx.fillStyle = '#f0d36b';
        ctx.fillRect(player.x + 31, player.y + (player.crouching ? 11 : -7), 5, 5);
      } else if (activeSkin === 'giorno') {
        ctx.fillStyle = '#f4d36b';
        ctx.beginPath();
        ctx.arc(player.x + 16, player.y + (player.crouching ? 14 : -4), 6, 0, Math.PI * 2);
        ctx.arc(player.x + 24, player.y + (player.crouching ? 13 : -5), 6, 0, Math.PI * 2);
        ctx.arc(player.x + 31, player.y + (player.crouching ? 14 : -4), 6, 0, Math.PI * 2);
        ctx.fill();
      } else if (activeSkin === 'dio') {
        const hairY = player.y + (player.crouching ? 11 : -7);
        ctx.fillStyle = '#f4d36b';
        ctx.fillRect(player.x + 8, hairY, 30, 10);
        ctx.fillRect(player.x + 11, hairY - 7, 23, 9);
        ctx.fillRect(player.x + 7, hairY + 8, 7, 12);
        ctx.fillRect(player.x + 30, hairY + 8, 7, 11);
        ctx.fillStyle = '#2f9b5c';
        ctx.fillRect(player.x + 10, hairY + 8, 25, 4);
        ctx.fillStyle = '#101014';
        ctx.fillRect(player.x + 12, player.y + (player.crouching ? 27 : 9), 5, 4);
        ctx.fillRect(player.x + 28, player.y + (player.crouching ? 27 : 9), 5, 4);
      } else {
        ctx.fillStyle = skin?.coat ?? '#24232a';
        ctx.fillRect(player.x + 8, player.y + (player.crouching ? 13 : -5), 29, 10);
      }
      ctx.fillStyle = legColor;
      ctx.fillRect(player.x + 12, player.y + 60 + (player.crouching ? 4 : step * 4), 9, player.crouching ? 10 : 14);
      ctx.fillRect(player.x + 28, player.y + 60 + (player.crouching ? 4 : -step * 4), 9, player.crouching ? 10 : 14);
      if (activeSkin === 'dio') {
        ctx.fillStyle = '#2f9b5c';
        ctx.fillRect(player.x + 11, player.y + 58 + (player.crouching ? 4 : step * 4), 11, 5);
        ctx.fillRect(player.x + 27, player.y + 58 + (player.crouching ? 4 : -step * 4), 11, 5);
        ctx.fillStyle = '#101014';
        ctx.fillRect(player.x + 10, player.y + 70 + (player.crouching ? 2 : step * 4), 12, 6);
        ctx.fillRect(player.x + 26, player.y + 70 + (player.crouching ? 2 : -step * 4), 12, 6);
      }
      ctx.fillStyle = '#d6f7ff';
      ctx.fillRect(player.x + 30, player.y + (player.crouching ? 27 : 9), 5, 5);
      ctx.fillStyle = parryCooldown > 0 ? '#555967' : parryColor;
      ctx.fillRect(player.x + 36, player.y + (player.crouching ? 42 : 28), 11, player.crouching ? 14 : 23);
      ctx.fillStyle = '#c8edf7';
      ctx.fillRect(player.x + 39, player.y + (player.crouching ? 44 : 31), 5, player.crouching ? 10 : 17);
      ctx.restore();

      if (parryTimer > 0) {
        ctx.strokeStyle = parryColor;
        ctx.lineWidth = 4;
        ctx.shadowColor = parryColor;
        ctx.shadowBlur = 20;
        ctx.beginPath();
        ctx.arc(player.x + PLAYER_W / 2, player.y + 36, parryRadius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(player.x + PLAYER_W / 2, player.y + 36, Math.max(24, parryRadius - 18), 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      if (gameRef.current.showHitboxes) {
        const hurtBox = playerHurtBox(player);
        ctx.strokeStyle = 'rgba(255, 46, 86, 0.95)';
        ctx.lineWidth = 2;
        ctx.strokeRect(hurtBox.x, hurtBox.y, hurtBox.w, hurtBox.h);
      }
    };

    const drawFlamethrower = () => {
      const game = gameRef.current;
      if (game.room < 16 || game.flameTimer <= 0) return;
      const { player } = game;
      const originX = player.x + PLAYER_W / 2 + player.facing * 30;
      const originY = player.y + (player.crouching ? 48 : 38);
      const length = 220;
      const height = 104;
      ctx.save();
      ctx.translate(originX, originY);
      ctx.scale(player.facing, 1);
      ctx.globalAlpha = clamp(game.flameTimer / 0.22, 0, 1);
      const gradient = ctx.createLinearGradient(0, 0, length, 0);
      gradient.addColorStop(0, '#ffffff');
      gradient.addColorStop(0.22, '#ffd35a');
      gradient.addColorStop(0.72, '#ff7438');
      gradient.addColorStop(1, 'rgba(255, 76, 32, 0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(0, -13);
      ctx.quadraticCurveTo(length * 0.42, -height * 0.55, length, -height * 0.18);
      ctx.quadraticCurveTo(length * 0.72, 0, length, height * 0.18);
      ctx.quadraticCurveTo(length * 0.42, height * 0.55, 0, 13);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha *= 0.7;
      ctx.fillStyle = '#ffef9c';
      ctx.beginPath();
      ctx.moveTo(0, -6);
      ctx.quadraticCurveTo(82, -20, 148, -4);
      ctx.quadraticCurveTo(82, 18, 0, 6);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    };

    const drawSnowCutscene = () => {
      const game = gameRef.current;
      if (game.snowCutscene === 'none') return;
      const t = game.snowCutsceneTimer;

      ctx.save();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.38)';
      ctx.beginPath();
      ctx.ellipse(456, GROUND + 4, 88, 22, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(82, 117, 140, 0.5)';
      ctx.beginPath();
      ctx.ellipse(456, GROUND + 8, 56, 13, 0, 0, Math.PI * 2);
      ctx.fill();

      if (game.snowCutscene === 'walk') {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
        ctx.fillRect(WIDTH / 2 - 290, 28, 580, 48);
        ctx.fillStyle = '#f7fbff';
        ctx.font = '800 18px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('СНЕЖНЫЙ ПЕРЕВАЛ: край локации трескается под ногами', WIDTH / 2, 58);
      }

      if (game.snowCutscene === 'fall') {
        const shake = Math.sin(t * 42) * 4;
        ctx.globalAlpha = clamp(t / 0.5, 0, 0.72);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
        ctx.globalAlpha = 1;
        ctx.fillStyle = 'rgba(9, 18, 28, 0.46)';
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
        ctx.fillStyle = '#ffffff';
        ctx.font = '900 30px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('ПРОВАЛ!', WIDTH / 2 + shake, 92);
      }

      if (game.snowCutscene === 'warning') {
        ctx.fillStyle = '#08090c';
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
        ctx.strokeStyle = '#ff304d';
        ctx.lineWidth = 8;
        ctx.strokeRect(28, 28, WIDTH - 56, HEIGHT - 56);
        ctx.fillStyle = '#ff304d';
        ctx.font = '900 46px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('ВАГОНЕТКА ПОТЕРЯНА', WIDTH / 2, 164);
        ctx.fillStyle = '#f7fbff';
        ctx.font = '800 24px Inter, system-ui, sans-serif';
        ctx.fillText('Новая локация: Snow Pass', WIDTH / 2, 218);
        ctx.fillStyle = '#ffd35a';
        ctx.font = '900 28px Inter, system-ui, sans-serif';
        ctx.fillText('ОГНЕМЕТ АКТИВЕН: R', WIDTH / 2, 284);
        ctx.fillStyle = '#9bbfd3';
        ctx.font = '700 17px Inter, system-ui, sans-serif';
        ctx.fillText('Теперь портал требует только героя. Дальше пешком.', WIDTH / 2, 330);
      }
      ctx.textAlign = 'left';
      ctx.restore();
    };

    const drawTinyCart = (x: number, y: number, alpha = 1) => {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#34343c';
      ctx.fillRect(x - 32, y - 12, 64, 24);
      ctx.fillStyle = '#5b6070';
      ctx.fillRect(x - 25, y - 7, 50, 10);
      ctx.fillStyle = '#17171a';
      ctx.beginPath();
      ctx.arc(x - 18, y + 15, 8, 0, Math.PI * 2);
      ctx.arc(x + 18, y + 15, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffda67';
      ctx.lineWidth = 2;
      ctx.strokeRect(x - 26, y - 20, 52, 5);
      ctx.restore();
    };

    const drawFrostVictoryCutscene = () => {
      const game = gameRef.current;
      if (game.frostVictoryCutscene === 'none') return;
      const t = game.frostVictoryCutsceneTimer;
      ctx.save();
      ctx.fillStyle = `rgba(5, 12, 22, ${game.frostVictoryCutscene === 'returned' ? 0.82 : 0.28})`;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      if (game.frostVictoryCutscene === 'rise') {
        const progress = clamp(t / 6.4, 0, 1);
        const witchX = WIDTH / 2;
        const witchY = GROUND - 82 - progress * 138;
        const fade = 1 - clamp((t - 3.2) / 3.2, 0, 1);
        ctx.globalAlpha = fade;
        ctx.shadowColor = '#d8f7ff';
        ctx.shadowBlur = 28;
        ctx.strokeStyle = '#d8f7ff';
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.moveTo(witchX - 18, witchY + 18);
        ctx.lineTo(witchX - 58, witchY - 38);
        ctx.moveTo(witchX + 18, witchY + 18);
        ctx.lineTo(witchX + 58, witchY - 38);
        ctx.stroke();
        const robe = ctx.createLinearGradient(witchX, witchY - 16, witchX, witchY + 72);
        robe.addColorStop(0, '#ffffff');
        robe.addColorStop(1, '#3f8ed8');
        ctx.fillStyle = robe;
        ctx.fillRect(witchX - 30, witchY + 4, 60, 78);
        ctx.fillStyle = '#eef9ff';
        ctx.fillRect(witchX - 20, witchY - 30, 40, 36);
        ctx.fillStyle = '#e9fbff';
        ctx.fillRect(witchX - 10, witchY - 17, 7, 6);
        ctx.fillRect(witchX + 6, witchY - 17, 7, 6);
        ctx.fillStyle = '#d7f6ff';
        ctx.beginPath();
        ctx.moveTo(witchX, witchY - 50);
        ctx.lineTo(witchX - 30, witchY - 8);
        ctx.lineTo(witchX + 30, witchY - 8);
        ctx.closePath();
        ctx.fill();
        drawTinyCart(witchX, witchY + 36, clamp((t - 0.8) / 1.8, 0, 1));

        ctx.globalAlpha = clamp((t - 1.4) / 1.4, 0, 1);
        ctx.shadowBlur = 0;
        for (let i = 0; i < 90; i += 1) {
          const seed = i * 47.13;
          const drift = clamp((t - 1.2 - (i % 18) * 0.08) / 4.3, 0, 1);
          if (drift <= 0) continue;
          const side = i % 2 === 0 ? 1 : -1;
          const px = witchX + Math.sin(seed) * 34 + side * drift * (36 + (i % 7) * 9);
          const py = witchY - 34 + (i % 12) * 10 - drift * (44 + (i % 5) * 13);
          ctx.globalAlpha = (1 - drift) * 0.9;
          ctx.fillStyle = i % 3 === 0 ? '#ffffff' : '#d8f7ff';
          ctx.fillRect(px, py, 3 + (i % 3), 3 + (i % 2));
        }
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#f7fbff';
        ctx.font = '900 26px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('ЛЕДЯНАЯ ВЕДЬМА РАССЫПАЕТСЯ', WIDTH / 2, 72);
      } else {
        ctx.fillStyle = '#06120c';
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
        ctx.strokeStyle = '#52ff8f';
        ctx.lineWidth = 8;
        ctx.strokeRect(28, 28, WIDTH - 56, HEIGHT - 56);
        drawTinyCart(WIDTH / 2, 180, 1);
        ctx.fillStyle = '#52ff8f';
        ctx.shadowColor = '#52ff8f';
        ctx.shadowBlur = 22;
        ctx.font = '900 44px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('ВАГОНЕТКА ВЕРНУТА', WIDTH / 2, 278);
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#dfffe9';
        ctx.font = '800 20px Inter, system-ui, sans-serif';
        ctx.fillText('Дальше путь снова можно тащить вместе.', WIDTH / 2, 324);
      }
      ctx.textAlign = 'left';
      ctx.restore();
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
      const walk = Math.sin(frame * (zombie.kind === 'runner' ? 0.48 : 0.22) + zombie.x * 0.04);
      const windupLean = zombie.windupTimer > 0 ? Math.sin((1 - zombie.windupTimer) * 16) * 7 : 0;
      ctx.translate(zombie.x + windupLean, zombie.y + wobble);
      const scale = zombie.kind === 'boss' ? 1.82 : zombie.kind === 'brute' ? 1.22 : zombie.kind === 'runner' ? 0.86 : zombie.kind === 'shooter' ? 0.96 : 1;
      ctx.scale(scale, scale);
      ctx.translate(24, 20);
      ctx.rotate(zombie.windupTimer > 0 ? Math.sin(frame * 0.3) * 0.08 : walk * 0.025);
      ctx.translate(-24, -20);
      const isGolem = zombie.kind === 'boss' && gameRef.current.room === 5;
      const isLeshy = zombie.kind === 'boss' && gameRef.current.room === 10;
      const isNeonBoss = zombie.kind === 'boss' && gameRef.current.room === 15;
      const isFrostWitch = zombie.kind === 'boss' && (gameRef.current.room === 20 || gameRef.current.room === 20.5);
      const isCrackedFrostWitch = zombie.kind === 'boss' && gameRef.current.room === 20.5;
      const isWinterMob = isSnowRoom(gameRef.current.room) && zombie.kind !== 'boss';
      const isDesertMob = isDesertRoom(gameRef.current.room) && zombie.kind !== 'boss';
      const isNeonResting = isNeonBoss && zombie.specialVulnerable;
      if (isNeonResting) {
        ctx.translate(2, 13);
        ctx.rotate(-0.14);
      }
      if (isGolem) {
        const attack = zombie.windupTimer > 0 ? clamp(1 - zombie.windupTimer / 0.34, 0, 1) : 0;
        const fistBob = Math.sin(frame * 0.12) * 2;
        ctx.save();
        ctx.translate(24, 24);
        ctx.scale(1.12, 1.05);
        ctx.translate(-24, -24);
        ctx.lineWidth = 2.4;
        ctx.strokeStyle = '#29252a';
        ctx.fillStyle = '#4f4238';
        ctx.beginPath();
        ctx.moveTo(-9, 18);
        ctx.lineTo(6, -4);
        ctx.lineTo(42, -2);
        ctx.lineTo(58, 18);
        ctx.lineTo(48, 52);
        ctx.lineTo(6, 52);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        const rock = (x: number, y: number, w: number, h: number, color: string) => {
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.moveTo(x + w * 0.18, y);
          ctx.lineTo(x + w * 0.84, y + h * 0.08);
          ctx.lineTo(x + w, y + h * 0.46);
          ctx.lineTo(x + w * 0.72, y + h);
          ctx.lineTo(x + w * 0.16, y + h * 0.86);
          ctx.lineTo(x, y + h * 0.38);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = 'rgba(222, 190, 132, 0.42)';
          ctx.beginPath();
          ctx.moveTo(x + w * 0.22, y + h * 0.12);
          ctx.lineTo(x + w * 0.72, y + h * 0.16);
          ctx.lineTo(x + w * 0.52, y + h * 0.34);
          ctx.lineTo(x + w * 0.12, y + h * 0.3);
          ctx.closePath();
          ctx.fill();
        };

        rock(-18, -7 + attack * 5, 31, 31, '#7d684d');
        rock(37, -11 + attack * 4, 34, 34, '#9b7d55');

        ctx.strokeStyle = '#29252a';
        ctx.lineWidth = 3;
        ctx.fillStyle = '#5a4739';
        ctx.beginPath();
        ctx.moveTo(-6, 21);
        ctx.lineTo(-34, 39 + attack * 5);
        ctx.lineTo(-31, 58 + attack * 4);
        ctx.lineTo(-5, 47);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(52, 21);
        ctx.lineTo(81, 37 - attack * 8);
        ctx.lineTo(80, 58 - attack * 13);
        ctx.lineTo(48, 47);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        rock(-47, 50 + fistBob + attack * 4, 28, 27, '#80664a');
        rock(70, 47 - fistBob - attack * 15, 29, 28, '#9b7d55');

        ctx.fillStyle = '#80664a';
        ctx.strokeStyle = '#29252a';
        ctx.lineWidth = 2.5;
        ctx.fillRect(7, 50, 12, 31);
        ctx.strokeRect(7, 50, 12, 31);
        ctx.fillRect(34, 50, 13, 33);
        ctx.strokeRect(34, 50, 13, 33);
        rock(2, 78, 20, 11, '#5d4938');
        rock(31, 80, 22, 12, '#6f573e');

        ctx.fillStyle = '#8f714c';
        ctx.strokeStyle = '#29252a';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(13, 3);
        ctx.lineTo(35, 2);
        ctx.lineTo(43, 17);
        ctx.lineTo(36, 31);
        ctx.lineTo(13, 31);
        ctx.lineTo(6, 17);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#5d4938';
        ctx.fillRect(13, 21, 22, 6);
        ctx.fillStyle = '#57d5ff';
        ctx.shadowColor = '#57d5ff';
        ctx.shadowBlur = 10;
        ctx.fillRect(14, 13, 7, 5);
        ctx.fillRect(28, 13, 7, 5);

        if (zombie.windupTimer > 0) {
          drawWarningStar(28, -34, 20 + Math.sin(frame * 0.25) * 3, '#fff36e');
        }
        ctx.restore();
        ctx.restore();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.56)';
        ctx.fillRect(WIDTH / 2 - 180, 132, 360, 15);
        ctx.fillStyle = '#ff3a54';
        ctx.fillRect(WIDTH / 2 - 176, 136, 352 * (zombie.hp / zombie.maxHp), 7);
        ctx.fillStyle = '#fff';
        ctx.font = '900 14px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('BOSS 1 HP', WIDTH / 2, 126);
        ctx.textAlign = 'left';
        return;
      }
      if (isFrostWitch) {
        ctx.strokeStyle = '#d8f7ff';
        ctx.fillStyle = '#57d5ff';
        ctx.lineWidth = 3;
        for (let i = -3; i <= 3; i += 1) {
          const spearX = 24 + i * 9;
          const spearTop = -42 - (3 - Math.abs(i)) * 8;
          ctx.beginPath();
          ctx.moveTo(spearX, 48);
          ctx.lineTo(spearX, spearTop);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(spearX, spearTop - 12);
          ctx.lineTo(spearX - 5, spearTop + 2);
          ctx.lineTo(spearX + 5, spearTop + 2);
          ctx.closePath();
          ctx.fill();
        }
        ctx.fillStyle = 'rgba(216, 247, 255, 0.55)';
        ctx.fillRect(-8, 38, 64, 12);
      }
      ctx.fillStyle = zombie.stunTimer > 0 ? '#dfff7c' : zombie.kind === 'boss' ? '#8b4759' : zombie.kind === 'shooter' ? '#6f80c9' : zombie.kind === 'runner' ? '#a6d58e' : zombie.kind === 'brute' ? '#78905d' : '#9bc47d';
      if (isWinterMob) ctx.fillStyle = '#c8a574';
      if (isDesertMob) ctx.fillStyle = '#d8bd82';
      if (isGolem) ctx.fillStyle = '#7f786c';
      if (isLeshy) ctx.fillStyle = '#3f8d4f';
      if (isNeonBoss) ctx.fillStyle = '#2c6ba8';
      if (isFrostWitch) {
        const robe = ctx.createLinearGradient(24, 4, 24, 52);
        robe.addColorStop(0, '#ffffff');
        robe.addColorStop(1, '#3f8ed8');
        ctx.fillStyle = robe;
      }
      ctx.fillRect(9, 12, 30, 37);
      ctx.fillStyle = zombie.kind === 'boss' ? '#a94e67' : zombie.kind === 'shooter' ? '#8798ef' : zombie.kind === 'brute' ? '#8ba36d' : '#a6d58e';
      if (isWinterMob) ctx.fillStyle = '#b99b78';
      if (isDesertMob) ctx.fillStyle = '#bfa06c';
      if (isGolem) ctx.fillStyle = '#a69b89';
      if (isLeshy) ctx.fillStyle = '#61b86d';
      if (isNeonBoss) ctx.fillStyle = '#57d5ff';
      if (isFrostWitch) ctx.fillStyle = '#eef9ff';
      ctx.fillRect(11, -8, 25, 23);
      if (isWinterMob) {
        ctx.fillStyle = '#c51f2f';
        ctx.fillRect(8, 13, 33, 7);
        ctx.fillRect(26, 18, 7, 18);
        ctx.fillStyle = '#6b452d';
        ctx.fillRect(12, 42, 10, 15);
        ctx.fillRect(28, 42, 10, 15);
      }
      if (isDesertMob) {
        ctx.fillStyle = '#ead19a';
        ctx.beginPath();
        ctx.moveTo(9, 18);
        ctx.lineTo(39, 18);
        ctx.lineTo(36, 34);
        ctx.lineTo(31, 31);
        ctx.lineTo(26, 38);
        ctx.lineTo(20, 32);
        ctx.lineTo(14, 39);
        ctx.lineTo(9, 32);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#9a7448';
        ctx.fillRect(12, 41, 10, 16);
        ctx.fillRect(28, 41, 10, 16);
        ctx.fillStyle = zombie.kind === 'shooter' ? '#2c6ba8' : '#7b1e25';
        ctx.fillRect(8, -6, 30, 8);
        ctx.fillRect(30, 0, 11, 5);
        ctx.fillRect(34, 4, 7, 4);
        ctx.fillStyle = '#f2d7a6';
        ctx.fillRect(12, 15, 24, 4);
        if (zombie.kind === 'shooter') {
          ctx.fillStyle = '#57d5ff';
          ctx.fillRect(35, 4, 10, 4);
        }
      }
      ctx.fillStyle = '#24331e';
      ctx.fillRect(18, -2, 6, 5);
      if (isFrostWitch) {
        ctx.fillStyle = isCrackedFrostWitch ? '#ff263d' : '#e9fbff';
        ctx.shadowColor = isCrackedFrostWitch ? '#ff263d' : 'transparent';
        ctx.shadowBlur = isCrackedFrostWitch ? 16 : 0;
        ctx.fillRect(15, -2, 6, 5);
        ctx.fillRect(27, -2, 6, 5);
        ctx.shadowBlur = 0;
        if (!isCrackedFrostWitch) {
          ctx.fillStyle = '#57d5ff';
          ctx.fillRect(27, -2, 6, 5);
        }
        ctx.fillStyle = '#d7f6ff';
        ctx.beginPath();
        ctx.moveTo(24, -19);
        ctx.lineTo(5, 4);
        ctx.lineTo(43, 4);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#2c6ba8';
        ctx.fillRect(4, 45, 42, 8);
        ctx.strokeStyle = '#6b452d';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(51, 44);
        ctx.lineTo(51, -42);
        ctx.stroke();
        ctx.strokeStyle = '#d8f7ff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < 6; i += 1) {
          const angle = (Math.PI * 2 * i) / 6 + frame * 0.025;
          ctx.moveTo(51, -42);
          ctx.lineTo(51 + Math.cos(angle) * 17, -42 + Math.sin(angle) * 17);
        }
        ctx.stroke();
        ctx.fillStyle = '#57d5ff';
        ctx.beginPath();
        ctx.ellipse(51, -42, 10, 7, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.ellipse(51, -42, 4, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        if (isCrackedFrostWitch) {
          ctx.strokeStyle = '#6d35d8';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(18, -8);
          ctx.lineTo(23, 6);
          ctx.lineTo(19, 20);
          ctx.moveTo(32, 10);
          ctx.lineTo(26, 26);
          ctx.lineTo(31, 46);
          ctx.moveTo(14, 30);
          ctx.lineTo(8, 42);
          ctx.stroke();
          ctx.fillStyle = 'rgba(255, 38, 61, 0.22)';
          ctx.fillRect(12, -4, 24, 11);
        }
      }
      if (isLeshy) {
        ctx.fillStyle = '#ff304d';
        ctx.fillRect(15, -1, 6, 5);
        ctx.fillRect(27, -1, 6, 5);
        ctx.fillStyle = '#245c33';
        ctx.fillRect(5, -15, 8, 14);
        ctx.fillRect(35, -15, 8, 14);
        ctx.fillRect(0, 9, 8, 31);
        ctx.fillRect(42, 9, 8, 31);
      }
      if (isNeonBoss) {
        const direction = zombie.specialDirection ?? 'down';
        ctx.fillStyle = '#101014';
        ctx.fillRect(13, -5, 23, 17);
        if (isNeonResting) {
          ctx.fillStyle = '#ffd84d';
          ctx.beginPath();
          ctx.moveTo(24, -4);
          ctx.lineTo(14, 11);
          ctx.lineTo(34, 11);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = '#101014';
          ctx.fillRect(23, 1, 3, 6);
          ctx.fillRect(23, 9, 3, 2);
        } else {
          ctx.fillStyle = '#ff65d8';
          ctx.beginPath();
          if (direction === 'up') {
            ctx.moveTo(24, -3);
            ctx.lineTo(15, 9);
            ctx.lineTo(33, 9);
          } else {
            ctx.moveTo(24, 10);
            ctx.lineTo(15, -2);
            ctx.lineTo(33, -2);
          }
          ctx.closePath();
          ctx.fill();
        }
      }
      if (zombie.kind === 'shooter') {
        ctx.fillStyle = '#57d5ff';
        ctx.fillRect(34, 20, 24, 8);
        ctx.fillRect(52, 17, 7, 14);
      }
      if (zombie.kind === 'boss') {
        ctx.fillStyle = isGolem ? '#57d5ff' : isLeshy ? '#ff304d' : isNeonBoss ? '#ff65d8' : '#fff36e';
        ctx.fillRect(9, -18, 8, 8);
        ctx.fillRect(30, -18, 8, 8);
        ctx.fillStyle = isGolem ? '#5f584f' : isLeshy ? '#246b38' : isNeonBoss ? '#1d3658' : '#31202a';
        ctx.fillRect(4, 47, 41, 7);
        if (isGolem) {
          ctx.fillStyle = '#5d564d';
          ctx.fillRect(3, 15, 9, 12);
          ctx.fillRect(36, 14, 10, 13);
          ctx.fillStyle = '#393631';
          ctx.fillRect(17, 22, 14, 5);
        }
        if (isLeshy) {
          ctx.fillStyle = '#2f7d42';
          ctx.fillRect(12, 12, 5, 32);
          ctx.fillRect(29, 12, 5, 32);
        }
        if (isNeonResting) {
          ctx.fillStyle = '#14345c';
          ctx.fillRect(10, 39, 13, 7);
          ctx.fillRect(25, 34, 7, 16);
        }
      }
      ctx.fillStyle = '#522323';
      ctx.fillRect(29, 6, 10, 5);
      ctx.strokeStyle = '#6f8861';
      ctx.lineWidth = zombie.kind === 'shooter' ? 4 : 6;
      ctx.beginPath();
      ctx.moveTo(11, 22);
      ctx.lineTo(-7, 33 + walk * 5);
      ctx.moveTo(38, 24);
      ctx.lineTo(55 + (zombie.windupTimer > 0 ? 8 : 0), 36 - walk * 5);
      ctx.stroke();
      ctx.fillStyle = '#2c2b26';
      ctx.fillRect(12, 48 + walk * 2, 8, 12);
      ctx.fillRect(31, 48 - walk * 2, 8, 12);
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

    const drawProjectiles = () => {
      for (const projectile of gameRef.current.projectiles) {
        if (projectile.kind === 'neonBeam') {
          const warning = projectile.warning ?? 0;
          const beamY = projectile.beamDirection === 'up' ? GROUND - 88 : GROUND - 44;
          if (warning <= 0) {
            const pulse = Math.sin(frame * 0.7) * 0.5 + 0.5;
            ctx.save();
            ctx.globalAlpha = 0.92;
            ctx.fillStyle = '#57d5ff';
            ctx.fillRect(0, beamY - 10, WIDTH, 21);
            ctx.globalAlpha = 0.35 + pulse * 0.25;
            ctx.fillStyle = '#ff65d8';
            ctx.fillRect((frame * 18) % WIDTH - WIDTH, beamY - 15, WIDTH * 2, 7);
            ctx.fillStyle = '#ffffff';
            ctx.globalAlpha = 0.95;
            ctx.fillRect(0, beamY - 3, WIDTH, 7);
            ctx.restore();
          }
        } else if (projectile.kind === 'acid' || projectile.kind === 'acidStar') {
          const warning = projectile.warning ?? 0;
          const total = projectile.totalWarning ?? 1;
          const targetX = projectile.targetX ?? projectile.x;
          const targetY = projectile.targetY ?? GROUND;
          const power = warning > 0 ? 1 - warning / total : 1;
          ctx.save();
          ctx.globalAlpha = 0.18 + power * 0.5;
          ctx.fillStyle = projectile.kind === 'acidStar' ? '#57d5ff' : '#80ff5c';
          ctx.beginPath();
          ctx.ellipse(targetX, 78, 38, 13, 0, 0, Math.PI * 2);
          ctx.ellipse(targetX - 28, 82, 22, 10, 0, 0, Math.PI * 2);
          ctx.ellipse(targetX + 28, 82, 22, 10, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 0.12 + power * 0.45;
          if (projectile.kind === 'acidStar') drawWarningStar(targetX, targetY, projectile.size + 4, '#57d5ff');
          else {
            ctx.beginPath();
            ctx.ellipse(targetX, targetY, projectile.size + 4, projectile.size * 0.58, 0, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
          if (warning <= 0) {
            if (projectile.kind === 'acidStar') drawWarningStar(projectile.x, projectile.y, projectile.size, '#57d5ff');
            else {
              ctx.fillStyle = '#80ff5c';
              ctx.beginPath();
              ctx.moveTo(projectile.x, projectile.y - projectile.size);
              ctx.quadraticCurveTo(projectile.x + projectile.size, projectile.y + 2, projectile.x, projectile.y + projectile.size);
              ctx.quadraticCurveTo(projectile.x - projectile.size, projectile.y + 2, projectile.x, projectile.y - projectile.size);
              ctx.fill();
            }
          }
        } else if (projectile.kind === 'iceSpear') {
          const warning = projectile.warning ?? 0;
          const total = projectile.totalWarning ?? 1;
          const targetX = projectile.targetX ?? projectile.x;
          const targetY = projectile.targetY ?? projectile.y;
          const power = warning > 0 ? 1 - warning / total : 1;
          const spearColor = projectile.spearParryable ? '#b26bff' : '#d8f7ff';
          const spearDark = projectile.spearParryable ? '#6d35d8' : '#57d5ff';
          ctx.save();
          ctx.globalAlpha = 0.22 + power * 0.52;
          ctx.strokeStyle = spearDark;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(projectile.x, projectile.y);
          ctx.lineTo(targetX, targetY);
          ctx.stroke();
          ctx.globalAlpha = 0.28 + power * 0.5;
          drawWarningStar(targetX, targetY, projectile.size + 3, spearColor);
          ctx.restore();
          const angle = warning > 0 ? Math.atan2(targetY - projectile.y, targetX - projectile.x) : Math.atan2(projectile.vy, projectile.vx);
          ctx.save();
          ctx.translate(projectile.x, projectile.y);
          ctx.rotate(angle);
          ctx.globalAlpha = warning > 0 ? 0.46 + power * 0.42 : 1;
          ctx.fillStyle = spearColor;
          ctx.strokeStyle = spearDark;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(24, 0);
          ctx.lineTo(-18, -8);
          ctx.lineTo(-8, 0);
          ctx.lineTo(-18, 8);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(-9, -2, 24, 4);
          ctx.restore();
        } else if (projectile.kind === 'iceSpike') {
          const warning = projectile.warning ?? 0;
          const total = projectile.totalWarning ?? 1;
          const targetX = projectile.targetX ?? projectile.x;
          const power = warning > 0 ? 1 - warning / total : 1;
          ctx.save();
          if (warning > 0) {
            ctx.globalAlpha = 0.25 + power * 0.65;
            ctx.fillStyle = '#ffd84d';
            ctx.beginPath();
            ctx.moveTo(targetX, GROUND - 82);
            ctx.lineTo(targetX - 18, GROUND - 48);
            ctx.lineTo(targetX + 18, GROUND - 48);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = '#101014';
            ctx.fillRect(targetX - 2, GROUND - 72, 4, 13);
            ctx.fillRect(targetX - 2, GROUND - 55, 4, 4);
          } else {
            const activeDuration = projectile.activeDuration ?? 0.3;
            const rise = clamp((activeDuration - projectile.life) / 0.12, 0, 1);
            const mainHeight = 150 * rise;
            const sideHeight = 82 * rise;
            ctx.globalAlpha = 0.95;
            ctx.fillStyle = '#d8f7ff';
            ctx.strokeStyle = '#57d5ff';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(targetX, GROUND - mainHeight);
            ctx.lineTo(targetX - 28, GROUND);
            ctx.lineTo(targetX + 28, GROUND);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = 'rgba(87, 213, 255, 0.72)';
            ctx.beginPath();
            ctx.moveTo(targetX - 24, GROUND - 8);
            ctx.lineTo(targetX - 54, GROUND);
            ctx.lineTo(targetX - 18, GROUND - sideHeight);
            ctx.closePath();
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(targetX + 24, GROUND - 8);
            ctx.lineTo(targetX + 54, GROUND);
            ctx.lineTo(targetX + 18, GROUND - sideHeight);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(targetX - 4, GROUND - Math.max(24, mainHeight * 0.8), 8, Math.max(10, mainHeight * 0.55));
          }
          ctx.restore();
        } else if (projectile.kind === 'boulder') {
          const warning = projectile.warning ?? 0;
          const total = projectile.totalWarning ?? 1;
          const targetX = projectile.targetX ?? projectile.x;
          const targetY = projectile.targetY ?? GROUND;
          const shadowPower = warning > 0 ? 1 - warning / total : 1;
          ctx.save();
          ctx.globalAlpha = 0.18 + shadowPower * 0.62;
          drawWarningStar(targetX, targetY, projectile.size + 8, '#111111');
          ctx.restore();
          if (warning <= 0) {
            ctx.fillStyle = '#8b8172';
            ctx.strokeStyle = '#4d473f';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(projectile.x, projectile.y, projectile.size + 7, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = '#b9ad99';
            ctx.fillRect(projectile.x - 5, projectile.y - 11, 8, 5);
          }
        } else {
          drawWarningStar(projectile.x, projectile.y, projectile.size, '#57d5ff');
        }
      }
    };

    const explodeProjectile = (x: number, y: number) => {
      const game = gameRef.current;
      const radius = 78;
      let killed = 0;
      let hit = 0;
      for (const zombie of game.zombies) {
        if (zombie.hp <= 0 || zombie.kind === 'boss') continue;
        const zombieCenterX = zombie.x + (zombie.kind === 'brute' ? 30 : 24);
        const zombieCenterY = zombie.y + 20;
        const distance = Math.hypot(zombieCenterX - x, zombieCenterY - y);
        if (distance <= radius) {
          zombie.hp -= isSnowRoom(game.room) ? zombie.maxHp * 0.5 : zombie.maxHp;
          zombie.stunTimer = 0.3;
          hit += 1;
          if (zombie.hp <= 0) killed += 1;
          addSparks(zombieCenterX, zombieCenterY, game.parryColor, 18);
        }
      }
      addSparks(x, y, game.parryColor, 46);
      game.hitStop = Math.max(game.hitStop, 0.05);
      game.message = killed > 0 ? `STAR BURST: ${killed} down` : hit > 0 ? `STAR BURST: ${hit} hit` : 'STAR BURST';
      game.messageTimer = 0.8;
    };

    const fireShotgunParry = () => {
      const game = gameRef.current;
      if (!game.hasShotgun) return;
      const winterParryDamageMultiplier = isSnowRoom(game.room) ? 0.5 : 1;
      const originX = game.player.x + PLAYER_W / 2;
      const originY = game.player.y + 36;
      const facing = game.player.facing;
      let hits = 0;

      for (const zombie of game.zombies) {
        if (zombie.hp <= 0) continue;
        const centerX = zombie.x + (zombie.kind === 'boss' ? 52 : 26);
        const centerY = zombie.y + (zombie.kind === 'boss' ? 24 : 18);
        const dx = centerX - originX;
        const dy = centerY - originY;
        const forward = dx * facing;
        if (forward < 0 || forward > 220 || Math.abs(dy) > 72 + forward * 0.25) continue;

        hits += 1;
        if (zombie.kind === 'boss') {
          zombie.hp -= 2 * winterParryDamageMultiplier;
          zombie.stunTimer = Math.max(zombie.stunTimer, 0.35);
        } else {
          zombie.hp -= zombie.maxHp * winterParryDamageMultiplier;
          zombie.stunTimer = 0.4;
        }
        addSparks(centerX, centerY, '#f7f0df', zombie.kind === 'boss' ? 28 : 18);
      }

      for (let i = 0; i < 18; i += 1) {
        const spread = (Math.random() - 0.5) * 1.1;
        game.sparks.push({
          x: originX,
          y: originY,
          vx: facing * (180 + Math.random() * 230),
          vy: spread * 170,
          life: 0.16 + Math.random() * 0.18,
          color: '#f7f0df',
        });
      }

      if (hits > 0) {
        game.message = `SHOTGUN PARRY: ${hits} hit`;
        game.messageTimer = 0.75;
      }
    };

    const fireFlamethrower = () => {
      const game = gameRef.current;
      if (game.room < 16 || game.flameCooldown > 0) return;
      const originX = game.player.x + PLAYER_W / 2;
      const originY = game.player.y + (game.player.crouching ? 48 : 37);
      const facing = game.player.facing;
      let hits = 0;

      game.flameTimer = 0.22;
      game.flameCooldown = 0.55;
      game.projectiles = game.projectiles.filter((projectile) => {
        if (projectile.kind === 'neonBeam' || projectile.kind === 'iceSpike') return true;
        const activeX =
          projectile.kind === 'boulder' || projectile.kind === 'acid' || projectile.kind === 'acidStar'
            ? projectile.targetX ?? projectile.x
            : projectile.x;
        const activeY =
          projectile.kind === 'boulder' || projectile.kind === 'acid' || projectile.kind === 'acidStar'
            ? projectile.targetY ?? projectile.y
            : projectile.y;
        const forward = (activeX - originX) * facing;
        const width = 34 + forward * 0.36;
        const burned = forward >= 8 && forward <= 245 && Math.abs(activeY - originY) <= width;
        if (burned) {
          hits += 1;
          addSparks(activeX, activeY, '#ffd35a', 22);
        }
        return !burned;
      });
      for (const zombie of game.zombies) {
        if (zombie.hp <= 0) continue;
        const centerX = zombie.x + (zombie.kind === 'boss' ? 52 : 26);
        const centerY = zombie.y + (zombie.kind === 'boss' ? 24 : 22);
        const forward = (centerX - originX) * facing;
        const width = 36 + forward * 0.38;
        const flameReach = zombie.kind === 'boss' && (game.room === 20 || game.room === 20.5) ? 620 : 220;
        if (forward < 8 || forward > flameReach || Math.abs(centerY - originY) > width) continue;
        hits += 1;
        const flameDamage =
          zombie.kind === 'boss' ? (game.room === 20 || game.room === 20.5 ? 2 : 1) : isSnowRoom(game.room) ? 4 : 2;
        zombie.hp -= flameDamage;
        zombie.stunTimer = Math.max(zombie.stunTimer, zombie.kind === 'boss' ? 0.16 : 0.28);
        addSparks(centerX, centerY, '#ff8a3a', zombie.kind === 'boss' ? 12 : 18);
      }

      for (let i = 0; i < 24; i += 1) {
        const forward = 28 + Math.random() * 205;
        game.sparks.push({
          x: originX + facing * forward,
          y: originY + (Math.random() - 0.5) * (28 + forward * 0.34),
          vx: facing * (70 + Math.random() * 120),
          vy: -35 + Math.random() * 70,
          life: 0.12 + Math.random() * 0.18,
          color: Math.random() > 0.45 ? '#ff8a3a' : '#ffd35a',
        });
      }
      game.message = hits > 0 ? `FLAME R: ${hits} hit` : 'FLAME R';
      game.messageTimer = 0.45;
    };

    const finishSnowCutscene = () => {
      const game = gameRef.current;
      game.snowCutscene = 'none';
      game.snowCutsceneTimer = 0;
      game.player.x = 130;
      game.player.y = GROUND - PLAYER_H;
      game.player.vx = 0;
      game.player.vy = 0;
      game.zombies = spawnZombies(game.location, game.room);
      game.message = 'Вагонетка потеряна. Огнемет активен на R.';
      game.messageTimer = 2.2;
    };

    const updateSnowCutscene = (dt: number) => {
      const game = gameRef.current;
      const p = game.player;
      game.snowCutsceneTimer += dt;
      game.flameTimer = 0;
      game.flameCooldown = 0;
      game.messageTimer = 0;

      if (game.snowCutscene === 'walk') {
        p.facing = 1;
        p.vx = 125;
        p.x = Math.min(438, p.x + p.vx * dt);
        p.y = GROUND - PLAYER_H;
        if (p.x >= 438 || game.snowCutsceneTimer > 3.4) {
          game.snowCutscene = 'fall';
          game.snowCutsceneTimer = 0;
          p.vx = 0;
          addSparks(p.x + 18, GROUND - 8, '#ffffff', 36);
        }
        return;
      }

      if (game.snowCutscene === 'fall') {
        p.vx = 0;
        p.y = GROUND - PLAYER_H + Math.min(64, game.snowCutsceneTimer * 58);
        if (game.snowCutsceneTimer > 1.55) {
          game.snowCutscene = 'warning';
          game.snowCutsceneTimer = 0;
          addSparks(p.x + 18, GROUND - 10, '#d8efff', 70);
        }
        return;
      }

      if (game.snowCutscene === 'warning' && game.snowCutsceneTimer > 2.8) {
        finishSnowCutscene();
      }
    };

    const startFrostVictoryCutscene = () => {
      const game = gameRef.current;
      game.frostVictoryCutscene = 'rise';
      game.frostVictoryCutsceneTimer = 0;
      game.zombies = [];
      game.projectiles = [];
      game.flameTimer = 0;
      game.flameCooldown = 0;
      game.message = '';
      game.messageTimer = 0;
      addSparks(WIDTH / 2, GROUND - 160, '#d8f7ff', 90);
    };

    const updateFrostVictoryCutscene = (dt: number) => {
      const game = gameRef.current;
      game.frostVictoryCutsceneTimer += dt;
      game.player.vx = 0;
      game.player.vy = 0;
      game.parryTimer = 0;
      game.parryCooldown = 0;
      game.messageTimer = 0;
      if (game.frostVictoryCutscene === 'rise' && game.frostVictoryCutsceneTimer > 6.6) {
        game.frostVictoryCutscene = 'returned';
        game.frostVictoryCutsceneTimer = 0;
        game.cart.x = 78;
        game.cart.hp = game.cart.maxHp;
        addSparks(WIDTH / 2, 180, '#52ff8f', 90);
      } else if (game.frostVictoryCutscene === 'returned' && game.frostVictoryCutsceneTimer > 3.1) {
        game.frostVictoryCutscene = 'none';
        game.frostVictoryCutsceneTimer = 0;
        game.message = 'Вагонетка вернулась. Заходи в портал.';
        game.messageTimer = 1.4;
      }
    };

    const update = (dt: number) => {
      const game = gameRef.current;
      const keys = keysRef.current;
      const p = game.player;
      const inputX = (keys.left ? -1 : 0) + (keys.right ? 1 : 0);

      if (game.paused) {
        return;
      }

      if (game.won) {
        game.messageTimer = 99;
        return;
      }

      if (game.snowCutscene !== 'none') {
        updateSnowCutscene(dt);
        return;
      }

      if (game.frostVictoryCutscene !== 'none') {
        updateFrostVictoryCutscene(dt);
        return;
      }

      if (game.ambushZoomTimer > 0) {
        game.ambushZoomTimer = Math.max(0, game.ambushZoomTimer - dt);
        game.messageTimer = Math.max(0, game.messageTimer - dt);
        return;
      }

      const cartActive = hasCart(game.room);
      const parryDamageMultiplier = isSnowRoom(game.room) ? 0.5 : 1;
      const stopped = game.hitStop > 0;
      if (stopped) {
        game.hitStop = Math.max(0, game.hitStop - dt);
      }

      if (keys.parry && game.parryCooldown <= 0) {
        game.parryTimer = 0.19;
        game.parryCooldown = 0.62;
        game.message = 'PARRY WINDOW';
        game.messageTimer = 0.45;
        addSparks(p.x + PLAYER_W / 2, p.y + 34, game.parryColor, 10);
      }

      if (!stopped) {
        p.crouching = Boolean(keys.down && p.y >= GROUND - PLAYER_H - 1);
        p.vx = inputX * (p.crouching ? 105 : 215);
        if (inputX !== 0) p.facing = inputX;
        if (!p.crouching && keys.jump && p.y >= GROUND - PLAYER_H - 1) p.vy = -430;
        p.vy += 1030 * dt;
        p.x = clamp(p.x + p.vx * dt, 20, WIDTH - 72);
        p.y = Math.min(GROUND - PLAYER_H, p.y + p.vy * dt);

        if (keys.flame) fireFlamethrower();
        if (cartActive) {
          const clearedRoom = game.zombies.length === 0;
          const desiredCartX = p.x - (clearedRoom ? 78 : 105);
          const pull = clamp(desiredCartX - game.cart.x, -130, 130);
          game.cart.vx += pull * (clearedRoom ? 12 : 5.5) * dt;
          game.cart.vx *= clearedRoom ? 0.95 : 0.9;
          game.cart.x = clamp(game.cart.x + game.cart.vx * dt, 6, WIDTH - 145);
          game.cart.invuln = Math.max(0, game.cart.invuln - dt);
        }
      }
      game.flameTimer = Math.max(0, game.flameTimer - dt);
      game.flameCooldown = Math.max(0, game.flameCooldown - dt);

      const playerAtPortal = rectsOverlap({ x: p.x, y: p.y, w: PLAYER_W, h: PLAYER_H }, { x: 810, y: GROUND - 170, w: 90, h: 160 });
      const cartAtPortal = !cartActive || rectsOverlap({ x: game.cart.x, y: game.cart.y - 22, w: 112, h: 70 }, { x: 800, y: GROUND - 170, w: 108, h: 160 });
      const onlyShootersLeft =
        isDioQuestRoom(game.room) &&
        game.zombies.some((zombie) => zombie.hp > 0 && zombie.kind === 'shooter') &&
        game.zombies.every((zombie) => zombie.hp <= 0 || zombie.kind === 'shooter');
      if (onlyShootersLeft) {
        game.projectiles = game.projectiles.filter((projectile) => projectile.kind !== 'star');
        for (const zombie of game.zombies) {
          if (zombie.kind !== 'shooter' || zombie.hp <= 0) continue;
          zombie.vx = 0;
          zombie.windupTimer = 0;
          zombie.attackTarget = null;
          zombie.biteTimer = 99;
        }
      }
      if (!stopped && isAmbushBossRoom(game.room) && !game.ambushDefeated && !game.ambushTriggered && p.x > WIDTH / 2 - 24) {
        const boss = createZombie('boss', 690, 20, 0);
        boss.hp *= 2;
        boss.maxHp *= 2;
        boss.specialCounter = 2;
        boss.biteTimer = 0.7;
        game.zombies = [boss];
        game.projectiles = [];
        game.ambushTriggered = true;
        game.ambushZoomTimer = 2.6;
        game.hitStop = 0.08;
        game.message = 'REMATCH: треснувшая ледяная ведьма';
        game.messageTimer = 2.6;
        addSparks(boss.x + 52, boss.y - 16, '#ff263d', 90);
      }
      if (keys.portal && playerAtPortal) {
        if ((game.zombies.length === 0 || onlyShootersLeft) && cartAtPortal) {
          const dioQuestRoom = game.room;
          if (onlyShootersLeft) {
            if (!game.dioQuestRooms.includes(game.room)) game.dioQuestRooms.push(game.room);
          } else if (isDioQuestRoom(game.room)) {
            game.dioQuestRooms = [];
          }
          switchLocation();
          if (onlyShootersLeft) {
            game.message = `DIO quest: room ${dioQuestRoom} counted.`;
            game.messageTimer = 1.2;
          } else if (isDioQuestRoom(dioQuestRoom)) {
            game.message = 'DIO quest reset: стрелков тоже убили.';
            game.messageTimer = 1.2;
          }
        } else {
          game.message = game.zombies.length > 0 ? 'Сначала зачисти комнату.' : 'Дотащи вагонетку ближе к порталу.';
          game.messageTimer = 0.9;
        }
      }

      for (const zombie of game.zombies) {
        if (zombie.hp <= 0) continue;
        if (game.freezeMobs) continue;
        if (onlyShootersLeft && zombie.kind === 'shooter') continue;
        if (!stopped) {
          zombie.stunTimer = Math.max(0, zombie.stunTimer - dt);
          zombie.biteTimer = Math.max(0, zombie.biteTimer - dt);
          if (zombie.windupTimer > 0) {
            zombie.windupTimer = Math.max(0, zombie.windupTimer - dt);
          }
        }
        if (!stopped && zombie.kind === 'boss' && (game.room === 20 || game.room === 20.5)) {
          zombie.vx = 0;
          zombie.attackTarget = null;
        } else if (!stopped && zombie.stunTimer <= 0 && zombie.windupTimer <= 0) {
          const cartCenter = game.cart.x + 56;
          const playerDistance = Math.abs((p.x + PLAYER_W / 2) - zombie.x);
          const cartDistance = cartActive ? Math.abs(cartCenter - zombie.x) * (game.cart.hp <= 3 ? 0.72 : 1) : Number.POSITIVE_INFINITY;
          const targetX = cartDistance < playerDistance ? cartCenter : p.x + PLAYER_W / 2;
          const direction = targetX > zombie.x ? 1 : -1;
          const speed = zombieStats(zombie.kind, game.room).speed;
          const desiredDistance = zombie.kind === 'shooter' ? 310 : 0;
          const distanceToTarget = Math.abs(targetX - zombie.x);
          if (zombie.kind === 'shooter' && distanceToTarget < desiredDistance) {
            zombie.vx = -direction * speed;
          } else if (zombie.kind === 'shooter' && distanceToTarget < desiredDistance + 80) {
            zombie.vx = 0;
          } else {
            zombie.vx = direction * speed;
          }
          zombie.x += zombie.vx * dt;
        }

        const zombieBox = { x: zombie.x + 4, y: zombie.y - 10, w: 54, h: 70 };
        if (zombie.kind === 'boss') {
          zombieBox.x = zombie.x + 4;
          zombieBox.y = zombie.y - 24;
          zombieBox.w = 92;
          zombieBox.h = 118;
        }
        const cartBox = cartHurtBox(game.cart);
        const playerBox = playerHurtBox(p);
        const cartHitCenter = rectCenter(cartBox);
        const playerHitCenter = rectCenter(playerBox);
        const canHitCart = cartActive && rectsOverlap(cartBox, zombieBox);
        const canHitPlayer = rectsOverlap(playerBox, zombieBox);

        if (!stopped && zombie.kind === 'shooter' && zombie.hp > 0 && zombie.biteTimer <= 0 && zombie.windupTimer <= 0) {
          zombie.windupTimer = 0.68;
          zombie.attackTarget = cartActive && game.cart.hp <= p.hp ? 'cart' : 'player';
          zombie.parriedThisSwing = true;
          zombie.biteTimer = 99;
        }

        if (!stopped && zombie.kind === 'shooter' && zombie.hp > 0 && zombie.windupTimer <= 0 && zombie.attackTarget) {
          const targetX = zombie.attackTarget === 'cart' ? cartHitCenter.x : playerHitCenter.x;
          const targetY = zombie.attackTarget === 'cart' ? cartHitCenter.y : playerHitCenter.y;
          const dx = targetX - (zombie.x + 34);
          const dy = targetY - (zombie.y + 8);
          const distance = Math.hypot(dx, dy) || 1;
          const speed = 175;
          game.projectiles.push({
            x: zombie.x + 42,
            y: zombie.y + 6,
            vx: (dx / distance) * speed,
            vy: (dy / distance) * speed,
            life: 4,
            damage: game.room >= 15 ? 2 : 1,
            size: 11,
            kind: 'star',
            target: zombie.attackTarget,
          });
          addSparks(zombie.x + 42, zombie.y + 6, '#57d5ff', 10);
          zombie.attackTarget = null;
          zombie.biteTimer = 1.55;
        }

        if (!stopped && zombie.kind === 'boss' && game.room === 5 && zombie.hp > 0 && zombie.biteTimer <= 0 && zombie.windupTimer <= 0) {
          const targetCart = cartActive && game.cart.hp <= p.hp;
          const targetPoint = targetCart ? cartHitCenter : playerHitCenter;
          const targetX = targetPoint.x;
          const targetY = targetPoint.y;
          const warning = 1.05;
          game.projectiles.push({
            x: targetX,
            y: -70,
            vx: 0,
            vy: 430,
            life: 4,
            damage: 2,
            size: 19,
            kind: 'boulder',
            targetX,
            targetY,
            target: targetCart ? 'cart' : 'player',
            warning,
            totalWarning: warning,
          });
          zombie.windupTimer = 0.34;
          zombie.attackTarget = null;
          zombie.biteTimer = 1.45;
          game.message = 'Голем бросает булыжник: смотри на тень.';
          game.messageTimer = 1;
        }

        if (!stopped && zombie.kind === 'boss' && game.room === 10 && zombie.hp > 0 && zombie.biteTimer <= 0 && zombie.windupTimer <= 0) {
          zombie.specialCounter += 1;
          const isBlueStar = zombie.specialCounter % 3 === 0;
          const targetCart = cartActive && game.cart.hp <= p.hp && Math.abs(cartHitCenter.x - playerHitCenter.x) > 45;
          const targetPoint = targetCart ? cartHitCenter : playerHitCenter;
          const targetX = clamp(targetPoint.x, 55, WIDTH - 55);
          const targetY = targetPoint.y;
          const warning = isBlueStar ? 1.15 : 1.0;
          game.projectiles.push({
            x: targetX,
            y: 92,
            vx: 0,
            vy: isBlueStar ? 185 : 205,
            life: 3.2,
            damage: 1,
            size: isBlueStar ? 13 : 10,
            kind: isBlueStar ? 'acidStar' : 'acid',
            targetX,
            targetY,
            target: targetCart ? 'cart' : 'player',
            warning,
            totalWarning: warning,
          });
          zombie.windupTimer = 0.45;
          zombie.attackTarget = null;
          zombie.biteTimer = isBlueStar ? 1.55 : 1.25;
          game.message = isBlueStar ? 'Синяя кислотная звезда: парируй в лешего.' : 'Леший вызывает одну кислотную каплю.';
          game.messageTimer = 1.4;
        }

        if (!stopped && zombie.kind === 'boss' && game.room === 15 && zombie.hp > 0 && !zombie.specialVulnerable && zombie.biteTimer <= 0 && zombie.windupTimer <= 0) {
          if (zombie.specialCounter >= 2) {
            zombie.specialVulnerable = true;
            zombie.specialDirection = undefined;
            zombie.attackTarget = null;
            zombie.windupTimer = 0;
            zombie.biteTimer = 99;
            addSparks(zombie.x + 44, zombie.y + 8, '#ffd84d', 20);
            game.message = 'Ошибка неон-босса: подойди и парируй корпус.';
            game.messageTimer = 1.4;
          } else {
          const direction = Math.random() > 0.5 ? 'up' : 'down';
          const warning = 1;
          zombie.specialDirection = direction;
          zombie.specialCounter += 1;
          game.projectiles.push({
            x: WIDTH / 2,
            y: direction === 'up' ? GROUND - 88 : GROUND - 44,
            vx: 0,
            vy: 0,
            life: warning + 0.45,
            damage: 2,
            size: 1,
            kind: 'neonBeam',
            beamDirection: direction,
            warning,
            totalWarning: warning,
            target: 'player',
          });
          zombie.windupTimer = 0.5;
          zombie.attackTarget = null;
          zombie.biteTimer = 1.65;
          game.message = direction === 'up' ? 'Стрелка вверх: луч сверху, присядь.' : 'Стрелка вниз: луч снизу, прыгай.';
          game.messageTimer = 1.2;
          }
        }

        if (!stopped && zombie.kind === 'boss' && (game.room === 20 || game.room === 20.5) && zombie.hp > 0 && zombie.biteTimer <= 0 && zombie.windupTimer <= 0 && !game.projectiles.some((projectile) => projectile.kind === 'iceSpear' || projectile.kind === 'iceSpike')) {
          const rematch = game.room === 20.5;
          const speedMultiplier = rematch ? 1.5 : 1;
          const attackMode = zombie.specialCounter % 3;
          zombie.specialCounter += 1;
          if (attackMode === 1) {
            const spikeWarning = rematch ? 0.5 : 0.75;
            const spikeActive = rematch ? 0.2 : 0.3;
            for (let i = 0; i < 3; i += 1) {
              const targetX = clamp(playerHitCenter.x + (i - 1) * 72, 48, WIDTH - 48);
              game.projectiles.push({
                x: targetX,
                y: GROUND,
                vx: 0,
                vy: 0,
                life: spikeWarning + spikeActive,
                damage: 1,
                size: 18,
                kind: 'iceSpike',
                targetX,
                targetY: GROUND,
                target: 'player',
                warning: spikeWarning,
                totalWarning: spikeWarning,
                activeDuration: spikeActive,
              });
            }
            zombie.windupTimer = rematch ? 0.38 : 0.55;
            zombie.biteTimer = rematch ? 1.05 : 1.55;
            game.message = 'Шипы из-под земли: прыгай!';
          } else {
            const superSpears = attackMode === 2;
            const volley = superSpears ? 2 : 3;
            const castX = playerHitCenter.x;
            const castY = playerHitCenter.y;
            for (let i = 0; i < volley; i += 1) {
              const delay = i * 0.3;
              const targetX = clamp(castX + (i - (volley - 1) / 2) * (superSpears ? 44 : 62), 50, WIDTH - 50);
              const targetY = castY + 4;
              const startX = zombie.x + 52 + (i - (volley - 1) / 2) * 28;
              const startY = zombie.y - 118 - (i % 2) * 12;
              const dx = targetX - startX;
              const dy = targetY - startY;
              const distance = Math.hypot(dx, dy) || 1;
              const speed = (superSpears ? 220 : 205) * speedMultiplier;
              const warning = ((superSpears ? 1.2 : 1.05) + delay) / speedMultiplier;
              game.projectiles.push({
                x: startX,
                y: startY,
                vx: (dx / distance) * speed,
                vy: (dy / distance) * speed,
                life: warning + 3.3,
                damage: superSpears ? 2 : 1,
                size: superSpears ? 17 : 14,
                kind: 'iceSpear',
                targetX,
                targetY,
                target: 'player',
                warning,
                totalWarning: warning,
                spearParryable: superSpears,
              });
            }
            zombie.windupTimer = (superSpears ? 0.56 : 0.42) / speedMultiplier;
            zombie.biteTimer = (superSpears ? 2.05 : 1.85) / speedMultiplier;
            game.message = superSpears ? 'Фиолетовые супер-копья: парируй!' : 'Белые копья нельзя парировать.';
          }
          zombie.attackTarget = null;
          game.messageTimer = 1.1;
        }

        if (!stopped && !(zombie.kind === 'boss' && (game.room === 5 || game.room === 10 || game.room === 15 || game.room === 20 || game.room === 20.5)) && zombie.kind !== 'shooter' && zombie.hp > 0 && zombie.biteTimer <= 0 && zombie.windupTimer <= 0 && (canHitPlayer || canHitCart)) {
          zombie.attackTarget = canHitCart && (!canHitPlayer || game.cart.hp <= p.hp) ? 'cart' : 'player';
          zombie.windupTimer = zombie.kind === 'boss' ? 0.78 : 0.62;
          zombie.parriedThisSwing = false;
          zombie.biteTimer = 99;
        }

        const targetBox = zombie.attackTarget === 'cart' ? cartBox : playerBox;
        const bonus = game.radiusLevel * 6;
        const parryRange = { x: p.x - 54 - bonus, y: p.y - 8 - bonus, w: PLAYER_W + 108 + bonus * 2, h: PLAYER_H + 24 + bonus * 2 };
        if (zombie.kind === 'boss') {
          parryRange.x = p.x - 78 - bonus;
          parryRange.y = p.y - 20 - bonus;
          parryRange.w = PLAYER_W + 156 + bonus * 2;
          parryRange.h = PLAYER_H + 40 + bonus * 2;
        }
        if (
          !stopped &&
          zombie.kind === 'boss' &&
          game.room === 15 &&
          zombie.specialVulnerable &&
          zombie.hp > 0 &&
          game.parryTimer > 0 &&
          rectsOverlap(parryRange, zombieBox)
        ) {
          zombie.hp -= 4 * parryDamageMultiplier;
          zombie.stunTimer = 0.5;
          zombie.specialCounter = 0;
          zombie.specialVulnerable = false;
          zombie.specialDirection = undefined;
          zombie.biteTimer = 1.15;
          zombie.windupTimer = 0;
          game.hitStop = 0.1;
          game.message = zombie.hp <= 0 ? 'ERROR PARRY: босс сломан' : 'ERROR PARRY: атаки возобновлены';
          game.messageTimer = 1;
          addSparks(zombie.x + 48, zombie.y + 18, game.parryColor, 64);
          fireShotgunParry();
        }
        const canParrySwing =
          zombie.hp > 0 &&
          zombie.windupTimer > 0 &&
          zombie.windupTimer < 0.24 &&
          !zombie.parriedThisSwing &&
          game.parryTimer > 0 &&
          rectsOverlap(parryRange, zombieBox);

        if (canParrySwing) {
          zombie.hp -= 1 * parryDamageMultiplier;
          zombie.stunTimer = zombie.kind === 'boss' ? 0.72 : 1.05;
          zombie.windupTimer = 0;
          zombie.attackTarget = null;
          zombie.parriedThisSwing = true;
          zombie.biteTimer = 0.8;
          zombie.x += Math.sign(zombie.x - p.x || p.facing) * (zombie.kind === 'boss' ? 28 : 58);
          game.hitStop = zombie.kind === 'boss' ? 0.075 : 0.055;
          game.message = zombie.hp <= 0 ? (zombie.kind === 'boss' ? 'BOSS PARRIED TO DEATH' : 'PERFECT PARRY: zombie down') : zombie.kind === 'boss' ? 'BOSS PARRY' : 'PERFECT PARRY';
          game.messageTimer = 0.9;
          addSparks(zombie.x + (zombie.kind === 'boss' ? 52 : 24), zombie.y + 14, game.parryColor, zombie.kind === 'boss' ? 58 : 34);
          fireShotgunParry();
        }

        if (!stopped && zombie.hp > 0 && zombie.windupTimer <= 0 && zombie.attackTarget && !zombie.parriedThisSwing) {
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
          zombie.biteTimer = zombie.kind === 'boss' ? 1.05 : 0.78;
        }
      }

      const projectileParryBonus = game.radiusLevel * 3;
      const projectileParryBox = {
        x: p.x - 28 - projectileParryBonus,
        y: p.y + 8 - projectileParryBonus,
        w: PLAYER_W + 56 + projectileParryBonus * 2,
        h: PLAYER_H - 4 + projectileParryBonus * 2,
      };
      const playerBox = playerHurtBox(p);
      const cartBox = cartHurtBox(game.cart);

      game.projectiles = game.projectiles
        .map((projectile) => ({
          ...projectile,
          warning: stopped || !projectile.warning ? projectile.warning : Math.max(0, projectile.warning - dt),
          x: stopped || (projectile.warning ?? 0) > 0 ? projectile.x : projectile.x + projectile.vx * dt,
          y: stopped || (projectile.warning ?? 0) > 0 ? projectile.y : projectile.y + projectile.vy * dt,
          life: stopped ? projectile.life : projectile.life - dt,
        }))
        .filter((projectile) => {
          const isBoulder = projectile.kind === 'boulder';
          const isAcid = projectile.kind === 'acid' || projectile.kind === 'acidStar';
          const isNeonBeam = projectile.kind === 'neonBeam';
          const isIceSpear = projectile.kind === 'iceSpear';
          const isIceSpike = projectile.kind === 'iceSpike';
          const activeX = isBoulder || isAcid || isIceSpike ? projectile.targetX ?? projectile.x : projectile.x;
          const activeY = isBoulder || isAcid || isIceSpike ? projectile.targetY ?? projectile.y : projectile.y;
          const acidDropBox = {
            x: projectile.x - Math.max(4, projectile.size * 0.42),
            y: projectile.y - Math.max(6, projectile.size * 0.68),
            w: Math.max(8, projectile.size * 0.84),
            h: Math.max(12, projectile.size * 1.36),
          };
          const projectileBox = {
            x: activeX - projectile.size,
            y: activeY - projectile.size,
            w: projectile.size * 2,
            h: projectile.size * 2,
          };
          if (isIceSpear) {
            projectileBox.x = projectile.x - 18;
            projectileBox.y = projectile.y - 24;
            projectileBox.w = 36;
            projectileBox.h = 48;
          }
          if (isIceSpike) {
            const spikeActive = projectile.activeDuration ?? 0.3;
            const spikeRise = (projectile.warning ?? 0) > 0 ? 0 : clamp((spikeActive - projectile.life) / 0.12, 0, 1);
            const spikeHeight = 118 * spikeRise;
            projectileBox.x = (projectile.targetX ?? projectile.x) - 22;
            projectileBox.y = GROUND - spikeHeight;
            projectileBox.w = 44;
            projectileBox.h = spikeHeight;
          }

          if (isNeonBeam) {
            if ((projectile.warning ?? 0) > 0) return projectile.life > 0;
            const beamY = projectile.beamDirection === 'up' ? GROUND - 88 : GROUND - 44;
            const beamBox = { x: 0, y: beamY - 8, w: WIDTH, h: 16 };
            const dodged = projectile.beamDirection === 'up' ? p.crouching : p.y < GROUND - PLAYER_H - 10;
            if (!dodged && rectsOverlap(playerBox, beamBox) && p.invuln <= 0) {
              p.hp -= projectile.damage;
              p.invuln = 0.75;
              addSparks(p.x + 22, p.y + 30, '#57d5ff', 24);
              game.message = projectile.beamDirection === 'up' ? 'Верхний луч надо приседать.' : 'Нижний луч надо перепрыгнуть.';
              game.messageTimer = 1;
            } else if (dodged) {
              game.message = projectile.beamDirection === 'up' ? 'DUCK DODGE' : 'JUMP DODGE';
              game.messageTimer = 0.5;
            }
            return projectile.life > 0;
          }

          if (isIceSpear && (projectile.warning ?? 0) > 0) {
            return projectile.life > 0;
          }

          if (isIceSpike && (projectile.warning ?? 0) > 0) {
            return projectile.life > 0;
          }

          if (isIceSpike) {
            const jumped = p.y < GROUND - PLAYER_H - 10;
            if (!jumped && rectsOverlap(playerBox, projectileBox) && p.invuln <= 0) {
              p.hp -= projectile.damage;
              p.invuln = 0.65;
              addSparks(projectile.targetX ?? projectile.x, GROUND - 52, '#d8f7ff', 24);
              game.message = 'Шипы попали. Нужно подпрыгнуть на предупреждении.';
              game.messageTimer = 1;
            }
            return projectile.life > 0;
          }

          if (
            game.parryTimer > 0 &&
            rectsOverlap(projectileParryBox, projectileBox) &&
            (projectile.kind === 'star' || (projectile.kind === 'iceSpear' && projectile.spearParryable) || ((isBoulder || projectile.kind === 'acidStar') && (projectile.warning ?? 0) < 0.3))
          ) {
            if (isBoulder) {
              const golem = game.zombies.find((zombie) => zombie.kind === 'boss' && game.room === 5);
              if (golem) {
                golem.hp -= 3 * parryDamageMultiplier;
                golem.stunTimer = 0.55;
                addSparks(golem.x + 52, golem.y + 10, game.parryColor, 62);
                game.message = 'BOULDER PARRY: камень в голема';
                game.messageTimer = 1;
                game.hitStop = Math.max(game.hitStop, 0.08);
              }
              addSparks(activeX, activeY, game.parryColor, 36);
              fireShotgunParry();
            } else if (projectile.kind === 'acidStar') {
              const leshy = game.zombies.find((zombie) => zombie.kind === 'boss' && game.room === 10);
              if (leshy) {
                leshy.hp -= 2 * parryDamageMultiplier;
                leshy.stunTimer = 0.45;
                addSparks(leshy.x + 52, leshy.y + 8, game.parryColor, 44);
                game.message = 'ACID STAR PARRY: в лешего';
                game.messageTimer = 0.9;
                game.hitStop = Math.max(game.hitStop, 0.06);
              }
              addSparks(activeX, activeY, game.parryColor, 28);
              fireShotgunParry();
            } else if (projectile.kind === 'iceSpear') {
              const witch = game.zombies.find((zombie) => zombie.kind === 'boss' && (game.room === 20 || game.room === 20.5));
              if (witch) {
                witch.hp -= (game.room === 20.5 ? 3 : 2) * parryDamageMultiplier;
                witch.stunTimer = 0.32;
                addSparks(witch.x + 52, witch.y + 4, projectile.spearParryable ? '#b26bff' : '#d8f7ff', 42);
                game.message = 'ICE SPEAR PARRY: копье в ведьму';
                game.messageTimer = 0.9;
                game.hitStop = Math.max(game.hitStop, 0.07);
              }
              addSparks(activeX, activeY, game.parryColor, 34);
              fireShotgunParry();
            } else {
              explodeProjectile(projectile.x, projectile.y);
              fireShotgunParry();
            }
            return false;
          }

          if (isBoulder && (projectile.warning ?? 0) > 0) {
            return projectile.life > 0;
          }

          if (isBoulder && projectile.y >= (projectile.targetY ?? GROUND)) {
            addSparks(activeX, activeY, '#8b8172', 30);
            game.hitStop = Math.max(game.hitStop, 0.04);
            if (projectile.target !== 'cart' && rectsOverlap(playerBox, projectileBox) && p.invuln <= 0) {
              p.hp -= projectile.damage;
              p.invuln = 0.8;
              game.message = 'Булыжник попал. Можно было отойти или парировать тень.';
              game.messageTimer = 1.2;
            } else if (cartActive && projectile.target !== 'player' && rectsOverlap(cartBox, projectileBox) && game.cart.invuln <= 0) {
              game.cart.hp -= projectile.damage;
              game.cart.invuln = 0.75;
              game.message = 'Булыжник ударил вагонетку.';
              game.messageTimer = 1;
            }
            return false;
          }

          if (isAcid && (projectile.warning ?? 0) > 0) {
            return projectile.life > 0;
          }

          if (isAcid && projectile.y < (projectile.targetY ?? GROUND)) {
            if (projectile.target !== 'cart' && rectsOverlap(playerBox, acidDropBox) && p.invuln <= 0) {
              p.hp -= projectile.damage;
              p.invuln = 0.55;
              addSparks(projectile.x, projectile.y, projectile.kind === 'acidStar' ? '#57d5ff' : '#80ff5c', 14);
              game.message = projectile.kind === 'acidStar' ? 'Синюю кислотную звезду можно парировать.' : 'Зеленая кислота не парируется.';
              game.messageTimer = 1;
              return false;
            }
            if (cartActive && projectile.target !== 'player' && rectsOverlap(cartBox, acidDropBox) && game.cart.invuln <= 0) {
              game.cart.hp -= projectile.damage;
              game.cart.invuln = 0.55;
              addSparks(projectile.x, projectile.y, projectile.kind === 'acidStar' ? '#57d5ff' : '#80ff5c', 14);
              game.message = 'Кислотный дождь попал по вагонетке.';
              game.messageTimer = 1;
              return false;
            }
          }

          if (isAcid && projectile.y >= (projectile.targetY ?? GROUND)) {
            addSparks(activeX, activeY, projectile.kind === 'acidStar' ? '#57d5ff' : '#80ff5c', 20);
            if (projectile.target !== 'cart' && rectsOverlap(playerBox, acidDropBox) && p.invuln <= 0) {
              p.hp -= projectile.damage;
              p.invuln = 0.55;
              game.message = projectile.kind === 'acidStar' ? 'Синюю кислотную звезду можно парировать.' : 'Зеленая кислота не парируется.';
              game.messageTimer = 1;
            } else if (cartActive && projectile.target !== 'player' && rectsOverlap(cartBox, acidDropBox) && game.cart.invuln <= 0) {
              game.cart.hp -= projectile.damage;
              game.cart.invuln = 0.55;
              game.message = 'Кислотный дождь попал по вагонетке.';
              game.messageTimer = 1;
            }
            return false;
          }

          if (projectile.target !== 'cart' && rectsOverlap(playerBox, projectileBox) && p.invuln <= 0) {
            p.hp -= projectile.damage;
            p.invuln = 0.75;
            addSparks(projectile.x, projectile.y, isIceSpear ? '#d8f7ff' : '#ff5f6d', isIceSpear ? 22 : 16);
            game.message = isIceSpear
              ? projectile.spearParryable
                ? 'Фиолетовое копье можно парировать в ведьму.'
                : 'Белое копье не парируется. Уворачивайся.'
              : 'Звезда попала. Их тоже можно парировать.';
            game.messageTimer = 1;
            return false;
          }

          if (cartActive && projectile.target !== 'player' && rectsOverlap(cartBox, projectileBox) && game.cart.invuln <= 0) {
            game.cart.hp -= projectile.damage;
            game.cart.invuln = 0.65;
            addSparks(projectile.x, projectile.y, '#ff6b4f', 16);
            game.message = 'Звезда ударила вагонетку.';
            game.messageTimer = 1;
            return false;
          }

          return projectile.life > 0 && projectile.x > -40 && projectile.x < WIDTH + 40 && projectile.y > -40 && projectile.y < HEIGHT + 40;
        });

      if (
        game.room === 20.5 &&
        !game.roomRewarded &&
        game.frostVictoryCutscene === 'none' &&
        game.zombies.some((zombie) => zombie.kind === 'boss' && zombie.hp <= 0)
      ) {
        startFrostVictoryCutscene();
        return;
      }

      game.zombies = game.zombies.filter((zombie) => zombie.hp > 0);
      if (game.zombies.length === 0 && (!isShopRoom(game.room) || isAmbushBossRoom(game.room)) && (!isAmbushBossRoom(game.room) || (game.ambushTriggered && !game.ambushDefeated)) && game.messageTimer <= 0) {
        game.message = game.room >= FINAL_ROOM
          ? 'Финальный босс повержен. Заходи в портал.'
          : cartActive
            ? 'Комната зачищена. Вагонетка ускорена, тащи ее в портал.'
            : 'Комната зачищена. Иди в портал пешком.';
        game.messageTimer = 0.6;
      }
      if (game.zombies.length === 0 && (!isShopRoom(game.room) || isAmbushBossRoom(game.room)) && !game.roomRewarded && (!isAmbushBossRoom(game.room) || (game.ambushTriggered && !game.ambushDefeated))) {
        const reward = isBossRoom(game.room) || isAmbushBossRoom(game.room) ? 5 : 2;
        game.coins += reward;
        let dioUnlockedNow = false;
        if (game.room === FINAL_ROOM) {
          game.defeatedFinalBoss = true;
          const dioQuestComplete = [21, 22, 23, 24].every((room) => game.dioQuestRooms.includes(room));
          if (dioQuestComplete && !game.unlockedSkins.includes('dio')) {
            game.unlockedSkins.push('dio');
            game.activeSkin = 'dio';
            dioUnlockedNow = true;
            game.message = 'DIO QUEST COMPLETE: Za Warudo unlocked.';
            game.messageTimer = 2;
            addSparks(game.player.x + PLAYER_W / 2, game.player.y + 28, '#fff36e', 90);
          }
        }
        if (isAmbushBossRoom(game.room)) {
          game.checkpointRoom = 21;
          game.ambushDefeated = true;
        }
        saveProgress(profileRef.current?.accountId ?? profileRef.current?.username, isAmbushBossRoom(game.room));
        game.roomRewarded = true;
        if (!dioUnlockedNow) {
          game.message = isAmbushBossRoom(game.room)
            ? `Rematch пройден. Waypoint ${displayRoom(game.checkpointRoom)} сохранен. +${reward} деталей.`
            : `Комната зачищена. +${reward} деталей для магазина.`;
          game.messageTimer = 1.4;
        }
      }

      if (p.hp <= 0 || (cartActive && game.cart.hp <= 0)) {
        const restartRoom = safeCheckpointRoom(game.checkpointRoom, game.room);
        game.checkpointRoom = restartRoom;
        game.player = { x: 170, y: GROUND - PLAYER_H, vx: 0, vy: 0, facing: 1, hp: 6, invuln: 0, crouching: false };
        game.cart = { x: 78, y: GROUND - 45, vx: 0, hp: 8, maxHp: 8, invuln: 0 };
        game.room = restartRoom;
        game.location = (Math.floor(game.room) - 1) % locations.length;
        game.won = false;
        game.paused = false;
        game.roomRewarded = false;
        game.flameTimer = 0;
        game.flameCooldown = 0;
        game.snowCutscene = 'none';
        game.snowCutsceneTimer = 0;
        game.frostVictoryCutscene = 'none';
        game.frostVictoryCutsceneTimer = 0;
        game.ambushTriggered = false;
        game.ambushZoomTimer = 0;
        game.projectiles = [];
        game.zombies = spawnZombies(game.location, game.room);
        if (isShopRoom(game.room) && !isAmbushBossRoom(game.room)) {
          game.paused = true;
          setMenu('shop');
        }
        game.message = p.hp <= 0 ? `Рестарт с waypoint ${displayRoom(restartRoom)}.` : `Вагонетку сломали. Waypoint ${displayRoom(restartRoom)}.`;
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
      const zoomBoss = game.ambushZoomTimer > 0 ? game.zombies.find((zombie) => zombie.kind === 'boss') : undefined;
      const zoomDuration = 2.6;
      const zoomElapsed = zoomBoss ? zoomDuration - game.ambushZoomTimer : 0;
      const zoomIn = clamp(zoomElapsed / 0.75, 0, 1);
      const zoomOut = clamp((zoomElapsed - 1.55) / 1.05, 0, 1);
      const zoomHold = zoomElapsed >= 0.75 && zoomElapsed <= 1.55 ? 1 : 0;
      const zoomPower = zoomBoss ? Math.max(zoomHold, zoomIn * (1 - zoomOut)) : 0;
      const zoomScale = 1 + zoomPower * 1.25;
      const zoomX = zoomBoss ? zoomBoss.x + 52 : WIDTH / 2;
      const zoomY = zoomBoss ? zoomBoss.y + 6 : HEIGHT / 2;

      ctx.save();
      if (zoomBoss) {
        ctx.translate(WIDTH / 2, HEIGHT / 2 + 28);
        ctx.scale(zoomScale, zoomScale);
        ctx.translate(-zoomX, -zoomY);
      }
      drawBackground(time);
      drawPortal(time);
      drawCart();
      drawProjectiles();
      for (const zombie of game.zombies) drawZombie(zombie);
      drawPlayer();
      drawFlamethrower();
      drawSparks();
      drawSnowCutscene();
      drawFrostVictoryCutscene();
      ctx.restore();

      if (zoomBoss) {
        ctx.fillStyle = `rgba(4, 5, 9, ${0.12 + zoomPower * 0.22})`;
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
        ctx.fillStyle = '#ff263d';
        ctx.shadowColor = '#ff263d';
        ctx.shadowBlur = 24;
        ctx.font = '900 34px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('THE THRONE CRACKS', WIDTH / 2, 86);
        ctx.fillStyle = '#f7fbff';
        ctx.shadowBlur = 0;
        ctx.font = '800 18px Inter, system-ui, sans-serif';
        ctx.fillText('REMATCH: треснувшая ледяная ведьма', WIDTH / 2, 118);
        ctx.textAlign = 'left';
      }

      if (game.snowCutscene === 'warning' || game.frostVictoryCutscene !== 'none') return;

      ctx.fillStyle = 'rgba(12, 12, 16, 0.54)';
      ctx.fillRect(18, 18, 360, 106);
      ctx.fillStyle = '#ffffff';
      ctx.font = '700 18px Inter, system-ui, sans-serif';
      ctx.fillText(`Room ${displayRoom(game.room)}`, 34, 47);
      ctx.fillText(`Hero ${'|'.repeat(game.player.hp)}`, 34, 76);
      ctx.fillText(hasCart(game.room) ? `Cart ${'|'.repeat(game.cart.hp)}` : 'Cart LOST', 34, 105);
      ctx.fillText(`${locations[game.location].name}`, 176, 76);
      if (isBossRoom(game.room) && game.zombies.some((zombie) => zombie.kind === 'boss')) {
        ctx.fillStyle = '#ff3a54';
        ctx.fillText('BOSS', 296, 105);
      }
      ctx.fillStyle = game.parryCooldown > 0 ? '#7d8192' : '#fff36e';
      ctx.fillText(game.parryCooldown > 0 ? 'F cooling' : 'F parry ready', 176, 47);
      ctx.fillStyle = game.parryColor;
      ctx.fillText(`Parts ${game.coins}`, 176, 105);
      ctx.fillStyle = '#ff2e56';
      ctx.font = '800 13px Inter, system-ui, sans-serif';
      ctx.fillText(BUILD_LABEL, WIDTH - 160, 30);

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

    let running = true;
    let animation = 0;

    const loop = (time: number) => {
      if (!running) return;
      const game = gameRef.current;
      const elapsed = Math.min(50, time - last);
      const dt = game.paused ? 0 : Math.min(0.033, elapsed / 1000);
      last = time;
      if (!game.paused) {
        frame += 1;
        visualTime += elapsed;
      }
      update(dt);
      draw(visualTime);
      setHud({
        hp: game.player.hp,
        cartHp: game.cart.hp,
        room: game.room,
        location: locations[game.location].name,
        zombies: game.zombies.length,
        boss: game.zombies.some((zombie) => zombie.kind === 'boss'),
        won: game.won,
        coins: game.coins,
        radiusLevel: game.radiusLevel,
        parryColor: game.parryColor,
        hasShotgun: game.hasShotgun,
        activeSkin: game.activeSkin,
        defeatedFinalBoss: game.defeatedFinalBoss,
        showHitboxes: game.showHitboxes,
        freezeMobs: game.freezeMobs,
        message: game.message,
      });
      animation = requestAnimationFrame(loop);
    };

    animation = requestAnimationFrame(loop);
    return () => {
      running = false;
      cancelAnimationFrame(animation);
    };
  }, []);

  const bossShopOpen = isShopRoom(hud.room);

  return (
    <main className="game-shell">
      <div className="game-stack">
        <section className="game-stage" aria-label="Carry a Parry game">
          <canvas ref={canvasRef} width={WIDTH} height={HEIGHT} />
          <div className="mobile-hud" aria-label="Mobile game status">
            <div className="mobile-bar">
              <span>Hero</span>
              <div className="bar-track">
                <div className="bar-fill hero" style={{ width: `${clamp((hud.hp / 6) * 100, 0, 100)}%` }} />
                <strong>{hud.hp}/6</strong>
              </div>
            </div>
            <div className="mobile-bar">
              <span>Cart</span>
              <div className="bar-track">
                <div className="bar-fill cart" style={{ width: `${hasCart(hud.room) ? clamp((hud.cartHp / 8) * 100, 0, 100) : 0}%` }} />
                <strong>{hasCart(hud.room) ? `${hud.cartHp}/8` : 'LOST'}</strong>
              </div>
            </div>
            <div className="mobile-counters">
              <span>Room {displayRoom(hud.room)}</span>
              <span>{hud.coins} parts</span>
            </div>
          </div>
          <div className="mobile-controls" aria-hidden="true">
            <button onPointerDown={() => (keysRef.current.left = true)} onPointerUp={() => (keysRef.current.left = false)} onPointerLeave={() => (keysRef.current.left = false)}>
              ←
            </button>
            <button onPointerDown={() => (keysRef.current.right = true)} onPointerUp={() => (keysRef.current.right = false)} onPointerLeave={() => (keysRef.current.right = false)}>
              →
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
        {profile?.role === 'admin' && (
          <div className="admin-abuse">
            <strong>Admin Abuse</strong>
            <button type="button" className="ghost" onClick={adminToggleFreezeMobs}>
              {hud.freezeMobs ? 'Unfreeze mobs' : 'Freeze mobs'}
            </button>
            <button type="button" className="ghost" onClick={() => adminDefeatMobs(false)}>
              Defeat all mobs
            </button>
            <button type="button" className="ghost" onClick={() => adminDefeatMobs(true)}>
              Defeat non-shooters
            </button>
          </div>
        )}
      </div>

      <aside className="game-panel">
        <h1>Carry a Parry</h1>
        {profile?.role === 'admin' && (
          <form
            className="admin-router"
            onSubmit={(event) => {
              event.preventDefault();
              jumpToRoom(Number(adminRoom));
            }}
          >
            <strong>Router</strong>
            <input
              type="number"
              min="1"
              max={FINAL_ROOM}
              step="0.5"
              value={adminRoom}
              onChange={(event) => setAdminRoom(event.target.value)}
              aria-label="Room number"
            />
            <button type="submit">Go</button>
          </form>
        )}
        <div className="stats">
          <span>HP: {hud.hp}</span>
          <span>Cart: {hasCart(hud.room) ? hud.cartHp : 'lost'}</span>
          <span>Room: {displayRoom(hud.room)}</span>
          <span>Location: {hud.location}</span>
          <span>{hud.boss ? 'Boss: alive' : `Zombies: ${hud.zombies}`}</span>
          <span>Goal: {hud.won ? 'finished' : `${Math.min(hud.room, FINAL_ROOM)}/${FINAL_ROOM}`}</span>
          <span>Parts: {hud.coins}</span>
          <span>Radius: +{hud.radiusLevel}</span>
          <span>Shotgun: {hud.hasShotgun ? 'yes' : 'no'}</span>
        </div>
        <div className="panel-actions">
          <button type="button" onClick={openMenu}>Menu</button>
          <button type="button" onClick={() => { gameRef.current.paused = true; setMenu('shop'); }}>
            {bossShopOpen ? 'Boss Shop' : 'Upgrades'}
          </button>
        </div>
        <div className="controls">
          <kbd>A</kbd><kbd>D</kbd><span>ходьба</span>
          <kbd>W</kbd><kbd>Space</kbd><span>прыжок</span>
          <kbd>S</kbd><kbd>Down</kbd><span>присед</span>
          <kbd>F</kbd><span>парирование</span>
          <kbd>R</kbd><span>огнемет</span>
          <kbd>E</kbd><span>портал</span>
        </div>
        <p>{hud.message}</p>
      </aside>

      <aside className="auth-panel">
        <section className="game-auth">
          <h2>Game account</h2>
          {profile ? (
            <div className="account-card">
              <strong>{profile.username}</strong>
              <span>{profile.role}</span>
              <span>{hud.coins} saved parts</span>
              <span>radius +{hud.radiusLevel}</span>
	              {profile.role === 'admin' && (
	                <>
		                <button type="button" className="ghost" onClick={toggleHitboxes}>
		                  {hud.showHitboxes ? 'Hide hitboxes' : 'Show hitboxes'}
		                </button>
		                <div className="admin-actions">
		                  <button type="button" className="ghost" onClick={adminHeal}>Heal</button>
		                  <button type="button" className="ghost" onClick={adminGiveShotgun}>Shotgun</button>
		                </div>
		                </>
		              )}
              <button type="button" className="ghost" onClick={signOut}>Sign out</button>
            </div>
          ) : (
	            <form className="form" onSubmit={handleGameAuth}>
	              <button type="button" className="google-button" onClick={signInWithGoogle}>Continue with Google</button>
	              <div className="auth-tabs">
                <button type="button" className={authMode === 'signin' ? 'active' : ''} onClick={() => setAuthMode('signin')}>Sign in</button>
                <button type="button" className={authMode === 'signup' ? 'active' : ''} onClick={() => setAuthMode('signup')}>Sign up</button>
              </div>
              <input
                value={authForm.username}
                onChange={(event) => setAuthForm((current) => ({ ...current, username: event.target.value }))}
                placeholder="username"
                autoComplete="username"
              />
              <input
                value={authForm.password}
                onChange={(event) => setAuthForm((current) => ({ ...current, password: event.target.value }))}
                placeholder="password"
                type="password"
                autoComplete={authMode === 'signin' ? 'current-password' : 'new-password'}
              />
              <button type="submit">{authMode === 'signin' ? 'Sign in' : 'Sign up'}</button>
              {authMessage && <p className="message">{authMessage}</p>}
            </form>
          )}
        </section>
      </aside>

      {menu !== 'closed' && (
        <section className="menu-overlay">
          <div className="menu-window">
            <div className="menu-title">
              <h2>{menu === 'shop' ? 'Shop' : 'Carry a Parry'}</h2>
              <span>{hud.coins} parts</span>
            </div>

            {menu === 'main' ? (
              <>
                <button type="button" onClick={startGame}>Start</button>
                <button type="button" onClick={() => setMenu('shop')}>Shop</button>
              </>
            ) : (
              <>
	                <div className="shop-row">
	                  <div>
	                    <strong>Parry radius</strong>
	                    <span>Level {hud.radiusLevel}/5</span>
	                  </div>
	                  <button type="button" onClick={buyRadius} disabled={gameRef.current.radiusLevel >= 5 || hud.coins < 4 + hud.radiusLevel * 3}>
	                    {hud.radiusLevel >= 5 ? 'Max' : `${4 + hud.radiusLevel * 3} parts`}
	                  </button>
	                </div>
		                {bossShopOpen && (
		                  <>
		                    <div className="shop-row">
		                      <div>
		                        <strong>Heal +3 HP</strong>
		                        <span>Hero HP {hud.hp}/6</span>
		                      </div>
		                      <button type="button" onClick={buyHeal} disabled={hud.hp >= 6 || hud.coins < 6}>6 parts</button>
		                    </div>
			                    <div className="shop-row">
			                      <div>
			                        <strong>Shotgun</strong>
			                        <span>{hud.hasShotgun ? 'Unlocked' : 'Close-range burst weapon'}</span>
			                      </div>
			                      <button type="button" onClick={buyShotgun} disabled={hud.hasShotgun || hud.coins < 40}>
			                        {hud.hasShotgun ? 'Owned' : '40 parts'}
			                      </button>
			                    </div>
			                  </>
			                )}
		                <div className="swatches">
	                  {parryColors.map((item) => {
                    const unlocked = gameRef.current.unlockedColors.includes(item.color);
                    return (
                      <button
                        key={item.color}
                        type="button"
                        className={hud.parryColor === item.color ? 'swatch active' : 'swatch'}
                        style={{ backgroundColor: item.color }}
                        onClick={() => buyColor(item.color, item.cost)}
                        disabled={!unlocked && hud.coins < item.cost}
                        aria-label={`${item.name} parry color`}
                      >
                        <span>{unlocked ? item.name : `${item.cost}`}</span>
                      </button>
                    );
	                  })}
	                </div>
	                {hud.defeatedFinalBoss && (
	                  <>
		                    {skins.map((skin) => {
		                      const unlocked = gameRef.current.unlockedSkins.includes(skin.id);
		                      const active = hud.activeSkin === skin.id;
		                      const questSkin = skin.id === 'dio' && !unlocked;
		                      return (
		                        <div className="shop-row" key={skin.id}>
	                          <div>
	                            <strong>{skin.name}</strong>
	                            <span>{skin.stand}</span>
	                          </div>
		                          <button type="button" onClick={() => buySkin(skin.id, skin.cost)} disabled={!unlocked && (questSkin || hud.coins < skin.cost)}>
		                            {active ? 'Equipped' : unlocked ? 'Equip' : questSkin ? 'Quest' : `${skin.cost} parts`}
		                          </button>
	                        </div>
	                      );
	                    })}
	                  </>
	                )}
	                <button type="button" className="ghost" onClick={() => setMenu('main')}>Back</button>
              </>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
