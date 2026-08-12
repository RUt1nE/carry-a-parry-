import { useEffect, useRef, useState } from 'react';
import { isSupabaseConfigured, supabase } from './lib/supabase';

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
  specialCounter: number;
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
  kind: 'star' | 'boulder' | 'acid' | 'acidStar';
  targetX?: number;
  targetY?: number;
  target?: 'player' | 'cart';
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
const chapterPalettes = [
  { sky: '#102236', far: '#2b4152', mid: '#4c3c4d', ground: '#6f5d46', accent: '#ffda67', hazard: '#d55b42' },
  { sky: '#13251c', far: '#27533d', mid: '#3b4b66', ground: '#40523a', accent: '#80ff9e', hazard: '#9cff57' },
  { sky: '#1b1531', far: '#40295d', mid: '#1f5b73', ground: '#52425b', accent: '#ff65d8', hazard: '#57d5ff' },
  { sky: '#21101d', far: '#3b1828', mid: '#6c2440', ground: '#37262e', accent: '#ff3a54', hazard: '#ff8a3a' },
  { sky: '#171212', far: '#44321f', mid: '#5f4c33', ground: '#2f2b24', accent: '#f1f0c2', hazard: '#d0a64a' },
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

function isBossRoom(room: number) {
  return Number.isInteger(room) && room % 5 === 0;
}

function displayRoom(room: number) {
  return Number.isInteger(room) ? String(room) : room.toFixed(1);
}

function rectsOverlap(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function playerHurtBox(player: { x: number; y: number }) {
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
  if (kind === 'boss') return { hp: 16 + Math.floor(room / 5) * 6, speed: 28 + room * 2 };
  if (kind === 'shooter') return { hp: 2 + roomBoost, speed: 24 + room * 2 };
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
    specialCounter: 0,
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
  const profileRef = useRef<Profile | null>(null);
  const gameRef = useRef({
    player: { x: 170, y: GROUND - PLAYER_H, vx: 0, vy: 0, facing: 1, hp: 6, invuln: 0 },
    cart: { x: 78, y: GROUND - 45, vx: 0, hp: 8, maxHp: 8, invuln: 0 },
    zombies: spawnZombies(0, 1),
    projectiles: [] as Projectile[],
    sparks: [] as Spark[],
    portalTimer: 0,
    location: 0,
    room: 1,
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
    roomRewarded: false,
    showHitboxes: false,
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
    showHitboxes: false,
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

  const saveProgress = (username: string | undefined) => {
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
            }
          : account,
      ),
    );
  };

  const applyAccountProgress = (account: GameAccount) => {
    gameRef.current.coins = account.parts;
    gameRef.current.radiusLevel = account.radiusLevel;
    gameRef.current.parryColor = account.parryColor;
    gameRef.current.unlockedColors = account.unlockedColors;
    gameRef.current.hasShotgun = account.hasShotgun;
    setHud((current) => ({
      ...current,
      coins: account.parts,
      radiusLevel: account.radiusLevel,
      parryColor: account.parryColor,
      hasShotgun: account.hasShotgun,
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
    if (game.hasShotgun || game.coins < cost) return;
    game.coins -= cost;
    game.hasShotgun = true;
    game.message = 'Shotgun unlocked';
    game.messageTimer = 1.2;
    saveProgress(profile?.accountId ?? profile?.username);
    setHud((current) => ({ ...current, coins: game.coins, hasShotgun: true }));
  };

  const jumpToRoom = (roomValue: number) => {
    const room = clamp(Math.round(roomValue * 2) / 2, 1, FINAL_ROOM);
    const game = gameRef.current;
    game.room = room;
    game.location = (room - 1) % locations.length;
    game.player = { x: 170, y: GROUND - PLAYER_H, vx: 0, vy: 0, facing: 1, hp: 6, invuln: 0 };
    game.cart = { x: 78, y: GROUND - 45, vx: 0, hp: 8, maxHp: 8, invuln: 0 };
    game.zombies = spawnZombies(game.location, game.room);
    game.projectiles = [];
    game.sparks = [];
    game.parryTimer = 0;
    game.parryCooldown = 0;
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
      gameRef.current.coins = Math.max(gameRef.current.coins, 99);
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
        game.message = 'Финал: 25 комнат пройдены. Вагонетка выжила.';
        game.messageTimer = 99;
        addSparks(WIDTH / 2, GROUND - 145, '#fff36e', 80);
        return;
      }
      game.room = isBossRoom(game.room) ? game.room + 0.5 : Math.floor(game.room) + 1;
      game.location = (Math.floor(game.room) - 1) % locations.length;
      game.player.x = 130;
      game.cart.x = 40;
      game.cart.hp = Math.min(game.cart.maxHp, game.cart.hp + 2);
      game.zombies = spawnZombies(game.location, game.room);
      game.projectiles = [];
      game.roomRewarded = false;
      game.portalTimer = 0.7;
      game.message = isShopRoom(game.room)
        ? `Магазин ${displayRoom(game.room)}: закупись перед дорогой.`
        : isBossRoom(game.room)
          ? `БОСС ${game.room / 5}: ${locations[game.location].name}`
          : `Комната ${game.room}: ${locations[game.location].name}`;
      game.messageTimer = 2.8;
      addSparks(850, GROUND - 80, chapterPalette(game.room).accent, 36);
      if (isShopRoom(game.room)) {
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
      const { player, parryTimer, parryCooldown, parryColor, radiusLevel } = gameRef.current;
      const parryRadius = 48 + radiusLevel * 6;
      const cx = player.x + PLAYER_W / 2;
      const running = Math.abs(player.vx) > 8 && player.y >= GROUND - PLAYER_H - 1;
      const step = running ? Math.sin(frame * 0.34) : 0;
      const bob = running ? Math.abs(step) * -3 : Math.sin(frame * 0.08) * 1.2;
      const armSwing = running ? step * 7 : Math.sin(frame * 0.08) * 2;
      ctx.save();
      ctx.translate(cx, player.y + bob);
      ctx.scale(player.facing, 1);
      ctx.translate(-cx, -player.y);
      ctx.strokeStyle = '#5eb9d8';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(player.x + 13, player.y + 31);
      ctx.lineTo(player.x - 1, player.y + 40 + armSwing);
      ctx.moveTo(player.x + 32, player.y + 31);
      ctx.lineTo(player.x + 45, player.y + 39 - armSwing);
      ctx.stroke();
      ctx.fillStyle = player.invuln > 0 ? '#ffeff8' : '#8fe0ff';
      ctx.fillRect(player.x + 9, player.y + 18, 25, 42);
      ctx.fillStyle = '#f2c28f';
      ctx.fillRect(player.x + 10, player.y, 24, 24);
      ctx.fillStyle = '#24232a';
      ctx.fillRect(player.x + 8, player.y - 5, 29, 10);
      ctx.fillStyle = '#141419';
      ctx.fillRect(player.x + 12, player.y + 60 + step * 4, 9, 14);
      ctx.fillRect(player.x + 28, player.y + 60 - step * 4, 9, 14);
      ctx.fillStyle = '#d6f7ff';
      ctx.fillRect(player.x + 30, player.y + 9, 5, 5);
      ctx.fillStyle = parryCooldown > 0 ? '#555967' : parryColor;
      ctx.fillRect(player.x + 36, player.y + 28, 11, 23);
      ctx.fillStyle = '#c8edf7';
      ctx.fillRect(player.x + 39, player.y + 31, 5, 17);
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
      ctx.fillStyle = zombie.stunTimer > 0 ? '#dfff7c' : zombie.kind === 'boss' ? '#8b4759' : zombie.kind === 'shooter' ? '#6f80c9' : zombie.kind === 'runner' ? '#a6d58e' : zombie.kind === 'brute' ? '#78905d' : '#9bc47d';
      if (isGolem) ctx.fillStyle = '#7f786c';
      if (isLeshy) ctx.fillStyle = '#3f8d4f';
      ctx.fillRect(9, 12, 30, 37);
      ctx.fillStyle = zombie.kind === 'boss' ? '#a94e67' : zombie.kind === 'shooter' ? '#8798ef' : zombie.kind === 'brute' ? '#8ba36d' : '#a6d58e';
      if (isGolem) ctx.fillStyle = '#a69b89';
      if (isLeshy) ctx.fillStyle = '#61b86d';
      ctx.fillRect(11, -8, 25, 23);
      ctx.fillStyle = '#24331e';
      ctx.fillRect(18, -2, 6, 5);
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
      if (zombie.kind === 'shooter') {
        ctx.fillStyle = '#57d5ff';
        ctx.fillRect(34, 20, 24, 8);
        ctx.fillRect(52, 17, 7, 14);
      }
      if (zombie.kind === 'boss') {
        ctx.fillStyle = isGolem ? '#57d5ff' : isLeshy ? '#ff304d' : '#fff36e';
        ctx.fillRect(9, -18, 8, 8);
        ctx.fillRect(30, -18, 8, 8);
        ctx.fillStyle = isGolem ? '#5f584f' : isLeshy ? '#246b38' : '#31202a';
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
        if (projectile.kind === 'acid' || projectile.kind === 'acidStar') {
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
      for (const zombie of game.zombies) {
        if (zombie.hp <= 0 || zombie.kind === 'boss') continue;
        const zombieCenterX = zombie.x + (zombie.kind === 'brute' ? 30 : 24);
        const zombieCenterY = zombie.y + 20;
        const distance = Math.hypot(zombieCenterX - x, zombieCenterY - y);
        if (distance <= radius) {
          zombie.hp = 0;
          zombie.stunTimer = 0.3;
          killed += 1;
          addSparks(zombieCenterX, zombieCenterY, game.parryColor, 18);
        }
      }
      addSparks(x, y, game.parryColor, 46);
      game.hitStop = Math.max(game.hitStop, 0.05);
      game.message = killed > 0 ? `STAR BURST: ${killed} down` : 'STAR BURST';
      game.messageTimer = 0.8;
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
      }

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
        if (!stopped) {
          zombie.stunTimer = Math.max(0, zombie.stunTimer - dt);
          zombie.biteTimer = Math.max(0, zombie.biteTimer - dt);
          if (zombie.windupTimer > 0) {
            zombie.windupTimer = Math.max(0, zombie.windupTimer - dt);
          }
        }
        if (!stopped && zombie.stunTimer <= 0 && zombie.windupTimer <= 0) {
          const cartCenter = game.cart.x + 56;
          const playerDistance = Math.abs((p.x + PLAYER_W / 2) - zombie.x);
          const cartDistance = Math.abs(cartCenter - zombie.x) * (game.cart.hp <= 3 ? 0.72 : 1);
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
        const canHitCart = rectsOverlap(cartBox, zombieBox);
        const canHitPlayer = rectsOverlap(playerBox, zombieBox);

        if (!stopped && zombie.kind === 'shooter' && zombie.hp > 0 && zombie.biteTimer <= 0 && zombie.windupTimer <= 0) {
          zombie.windupTimer = Math.max(0.36, 0.68 - game.room * 0.018);
          zombie.attackTarget = game.cart.hp <= p.hp ? 'cart' : 'player';
          zombie.parriedThisSwing = true;
          zombie.biteTimer = 99;
        }

        if (!stopped && zombie.kind === 'shooter' && zombie.hp > 0 && zombie.windupTimer <= 0 && zombie.attackTarget) {
          const targetX = zombie.attackTarget === 'cart' ? cartHitCenter.x : playerHitCenter.x;
          const targetY = zombie.attackTarget === 'cart' ? cartHitCenter.y : playerHitCenter.y;
          const dx = targetX - (zombie.x + 34);
          const dy = targetY - (zombie.y + 8);
          const distance = Math.hypot(dx, dy) || 1;
          const speed = 160 + game.room * 7;
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
          zombie.biteTimer = Math.max(0.9, 1.55 - game.room * 0.035);
        }

        if (!stopped && zombie.kind === 'boss' && game.room === 5 && zombie.hp > 0 && zombie.biteTimer <= 0 && zombie.windupTimer <= 0) {
          const targetCart = game.cart.hp <= p.hp;
          const targetPoint = targetCart ? cartHitCenter : playerHitCenter;
          const targetX = targetPoint.x;
          const targetY = targetPoint.y;
          const warning = Math.max(0.52, 1.05 - game.room * 0.02);
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
          const targetCart = game.cart.hp <= p.hp && Math.abs(cartHitCenter.x - playerHitCenter.x) > 45;
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

        if (!stopped && !(zombie.kind === 'boss' && (game.room === 5 || game.room === 10)) && zombie.kind !== 'shooter' && zombie.hp > 0 && zombie.biteTimer <= 0 && zombie.windupTimer <= 0 && (canHitPlayer || canHitCart)) {
          zombie.attackTarget = canHitCart && (!canHitPlayer || game.cart.hp <= p.hp) ? 'cart' : 'player';
          zombie.windupTimer = zombie.kind === 'boss' ? Math.max(0.42, 0.78 - game.room * 0.012) : Math.max(0.34, 0.62 - game.room * 0.025);
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
          addSparks(zombie.x + (zombie.kind === 'boss' ? 52 : 24), zombie.y + 14, game.parryColor, zombie.kind === 'boss' ? 58 : 34);
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
          zombie.biteTimer = zombie.kind === 'boss' ? Math.max(0.65, 1.05 - game.room * 0.02) : Math.max(0.44, 0.78 - game.room * 0.035);
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
          const activeX = isBoulder || isAcid ? projectile.targetX ?? projectile.x : projectile.x;
          const activeY = isBoulder || isAcid ? projectile.targetY ?? projectile.y : projectile.y;
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

          if (
            game.parryTimer > 0 &&
            rectsOverlap(projectileParryBox, projectileBox) &&
            (projectile.kind === 'star' || ((isBoulder || projectile.kind === 'acidStar') && (projectile.warning ?? 0) < 0.3))
          ) {
            if (isBoulder) {
              const golem = game.zombies.find((zombie) => zombie.kind === 'boss' && game.room === 5);
              if (golem) {
                golem.hp -= 3;
                golem.stunTimer = 0.55;
                addSparks(golem.x + 52, golem.y + 10, game.parryColor, 62);
                game.message = 'BOULDER PARRY: камень в голема';
                game.messageTimer = 1;
                game.hitStop = Math.max(game.hitStop, 0.08);
              }
              addSparks(activeX, activeY, game.parryColor, 36);
            } else if (projectile.kind === 'acidStar') {
              const leshy = game.zombies.find((zombie) => zombie.kind === 'boss' && game.room === 10);
              if (leshy) {
                leshy.hp -= 2;
                leshy.stunTimer = 0.45;
                addSparks(leshy.x + 52, leshy.y + 8, game.parryColor, 44);
                game.message = 'ACID STAR PARRY: в лешего';
                game.messageTimer = 0.9;
                game.hitStop = Math.max(game.hitStop, 0.06);
              }
              addSparks(activeX, activeY, game.parryColor, 28);
            } else {
              explodeProjectile(projectile.x, projectile.y);
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
            } else if (projectile.target !== 'player' && rectsOverlap(cartBox, projectileBox) && game.cart.invuln <= 0) {
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
            if (projectile.target !== 'player' && rectsOverlap(cartBox, acidDropBox) && game.cart.invuln <= 0) {
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
            } else if (projectile.target !== 'player' && rectsOverlap(cartBox, acidDropBox) && game.cart.invuln <= 0) {
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
            addSparks(projectile.x, projectile.y, '#ff5f6d', 16);
            game.message = 'Звезда попала. Их тоже можно парировать.';
            game.messageTimer = 1;
            return false;
          }

          if (projectile.target !== 'player' && rectsOverlap(cartBox, projectileBox) && game.cart.invuln <= 0) {
            game.cart.hp -= projectile.damage;
            game.cart.invuln = 0.65;
            addSparks(projectile.x, projectile.y, '#ff6b4f', 16);
            game.message = 'Звезда ударила вагонетку.';
            game.messageTimer = 1;
            return false;
          }

          return projectile.life > 0 && projectile.x > -40 && projectile.x < WIDTH + 40 && projectile.y > -40 && projectile.y < HEIGHT + 40;
        });

      game.zombies = game.zombies.filter((zombie) => zombie.hp > 0);
      if (game.zombies.length === 0 && !isShopRoom(game.room) && game.messageTimer <= 0) {
        game.message = game.room >= FINAL_ROOM ? 'Финальный босс повержен. Заезжай в портал.' : 'Комната зачищена. Тащи вагонетку в портал и жми E.';
        game.messageTimer = 0.6;
      }
      if (game.zombies.length === 0 && !isShopRoom(game.room) && !game.roomRewarded) {
        const reward = isBossRoom(game.room) ? 5 : 2;
        game.coins += reward;
        saveProgress(profileRef.current?.accountId ?? profileRef.current?.username);
        game.roomRewarded = true;
        game.message = `Комната зачищена. +${reward} деталей для магазина.`;
        game.messageTimer = 1.4;
      }

      if (p.hp <= 0 || game.cart.hp <= 0) {
        game.player = { x: 170, y: GROUND - PLAYER_H, vx: 0, vy: 0, facing: 1, hp: 6, invuln: 0 };
        game.cart = { x: 78, y: GROUND - 45, vx: 0, hp: 8, maxHp: 8, invuln: 0 };
        game.location = 0;
        game.room = 1;
        game.won = false;
        game.paused = false;
        game.roomRewarded = false;
        game.projectiles = [];
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
      drawProjectiles();
      for (const zombie of game.zombies) drawZombie(zombie);
      drawPlayer();
      drawSparks();

      ctx.fillStyle = 'rgba(12, 12, 16, 0.54)';
      ctx.fillRect(18, 18, 360, 106);
      ctx.fillStyle = '#ffffff';
      ctx.font = '700 18px Inter, system-ui, sans-serif';
      ctx.fillText(`Room ${displayRoom(game.room)}`, 34, 47);
      ctx.fillText(`Hero ${'|'.repeat(game.player.hp)}`, 34, 76);
      ctx.fillText(`Cart ${'|'.repeat(game.cart.hp)}`, 34, 105);
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

    const loop = (time: number) => {
      const game = gameRef.current;
      const elapsed = time - last;
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
        showHitboxes: game.showHitboxes,
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
          <button type="button" onClick={() => { gameRef.current.paused = true; setMenu('shop'); }}>Shop</button>
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
                <form
                  className="admin-jump"
                  onSubmit={(event) => {
                    event.preventDefault();
                    jumpToRoom(Number(adminRoom));
                  }}
                >
                  <input
                    type="number"
                    min="1"
                    max={FINAL_ROOM}
                    value={adminRoom}
                    onChange={(event) => setAdminRoom(event.target.value)}
                    aria-label="Room number"
                  />
                  <button type="submit">Go</button>
                </form>
                <button type="button" className="ghost" onClick={toggleHitboxes}>
                  {hud.showHitboxes ? 'Hide hitboxes' : 'Show hitboxes'}
                </button>
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
                <button type="button" className="ghost" onClick={() => setMenu('main')}>Back</button>
              </>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
