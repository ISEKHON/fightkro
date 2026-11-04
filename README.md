# KURSI KAND 🪑🥊

**The brutal battle for the throne.** A 3D political-satire fighting game for **mobile and PC browsers**, with deep fighting-game mechanics, cinematic finishers, rollback online play and a lot of fake news.

> All characters, parties, slogans and headlines are **fictional caricatures** made for satire. No real person or party is depicted. The game contains cartoon violence and stylised gore. Gore can be recoloured green or switched off.

---

## Features

### Fighters
There are 8 original netas plus a boss. Each one has 3 specials (light, heavy and EX versions), 1 or 2 supers, an X-Ray Breaker, 2 brutal finishers, 1 comedy finisher and a tag-partner assist.

| Fighter | Style |
| --- | --- |
| **Jumla Kumar** – The Promise Machine | All-rounder: ₹15L fireball, rising uppercut, rush kick |
| **Ghotala Seth** – Scam Emperor | Heavy: armored charge, money-bag lob, 360° bribe grab |
| **Bulldozer Bhaiya** – The Demolisher | Rushdown: demolition charge, bucket slam, command grab |
| **Votechor Vikas** – The Booth Ninja | Trickster: ballot-box teleport, EVM slide, ballot swarm |
| **Didi Dhamaka** – The Firecracker | Aggro: chappal shots, tantrum tornado, rage-install super |
| **Bahubali Bhaiya** – The Local Don | Grappler: dynasty suplex, armored lariat, bear-hug |
| **Tolltax Tau** – Gatekeeper of NH-420 | Zoner: FASTag zap, toll barrier walls, pothole traps |
| **Chikhta Anchor** – Prime-Time Screamer | Reach + stun scream + counter stance |
| **SUPREMO** – The Eternal Kursi | Boss: unlocked by clearing Arcade |

### Combat systems
- 60 fps deterministic simulation with real frame data (startup, active and recovery frames; hitstun and blockstun; push).
- 8 action buttons: **LP, HP, LK, HK, RAGE, DODGE, ASSIST, TAUNT**, plus a BLOCK button for touch players.
- Motion inputs: QCF, QCB, DP, half-circles, 360°, charge and double-QCF supers, with leniency windows, an input buffer, negative edge and SOCD cleaning.
- Chains, target combos, kara cancels, normal → special → super cancels, jump-cancel launchers, juggles with gravity scaling, OTG hits, ground bounces and damage scaling.
- **Rage Cancel**, **Burst** combo breaker, **Just Parry**, throw tech, Guard Crush, counter-hit and punish crumples.
- Movement: sidestep (evades straight attacks), invincible roll, dash and run, double jump, air dash, wall jump and tech rolls.
- **Wall splat → wall break** into the next stage zone. Some stages have three zones; the toll plaza ends on top of a moving rally truck.
- Stage weapons (chair, mic stand, placard, lathi, cone) that break after a few hits and can be thrown.
- Stage hazards (stray bull, VIP convoy). An angry crowd throws chappals at whichever fighter it is turning against.
- **KHATAM KARO!** At the end of the deciding round you can input a finisher. There are 15 cinematic finisher templates, including decapitation, explosion, crush, burial, spine-snap, impalement, a golden selfie statue, a party flag and a wedding, plus a stage finisher for each stage.
- **Crowd Spin meter**: big combos, taunts and parries win over the crowd, and the side the crowd favours does a little more damage.

### Modes
Arcade with boss and endings, Versus CPU (4 difficulty levels), Local 2P, **Online** (private rooms, ranked Elo ladder, spectating), **Election Campaign** roguelite (state map, scandal modifiers, party-fund shop, random events, endings based on vote share), **Rally 3v3** (alliance elimination where partners can betray you), Survival, **Daily Challenge** (seeded, with a global leaderboard), Training (frame data, hitbox view, dummy record and playback), **Ghosts** (an AI trained on your habits that you can share), Replays (saved or shared as a link), **Neta Creator**, and Manifesto perks.

### Presentation
- Procedural caricature rigs built in code (big heads, outlines, toon shading), with visible damage: bruises, black eye, cracked glasses, torn vest and a bloody face.
- An X-ray skeleton pass on X-Ray Breakers, impact frames, bloom, hit-stop, camera shake and FOV punch.
- An instanced cheering crowd, rain, smog, fireworks and confetti. Blood decals stay on the floor and walls.
- A live "Breaking News" director during fights and a satirical newspaper front page after each match.
- All audio is synthesized in WebAudio: hit and bone-crunch SFX, adaptive dhol/tabla music that builds with the fight, crowd beds, and a speech-synthesis announcer.
- Rolling clip capture of the last ~10 seconds with the headline burned in, shareable to WhatsApp, Instagram and X.

## Controls

**Keyboard (P1)**: move with `W A S D` (or the arrow keys); hold back to block · `U` LP · `I` HP · `J` LK · `K` HK · `O` RAGE · `L` DODGE · `H` ASSIST · `P` TAUNT · `Esc` pause.
**Keyboard (P2, local)**: arrow keys plus Numpad `4 5 1 2 6 3 0 7`, or `, . M N / B`.
**Gamepad** (standard mapping, hot-plug, rumble): X/□ LP · Y/△ HP · A/✕ LK · B/○ HK · RB RAGE · LB DODGE · LT ASSIST · RT BLOCK. Everything can be remapped in Settings.
**Touch** has three layouts:
- **Pro**: floating stick and 8 buttons. You can slide between buttons, and pressing between two buttons triggers both, for EX moves and throws.
- **Gesture**: swipe a motion and then tap a button. A quick swipe dashes, a flick up launches, a long-press charges, and a two-finger tap does a Rage Cancel.
- **Smart**: one-tap SPECIAL and SUPER that pick a suitable move for the situation, at 90% damage.

There is also a drag-to-edit layout editor, left-handed mode, haptics and a motion-leniency slider. Bluetooth controllers work on phones too.

## Running it

```bash
npm install
npm run dev        # game at http://localhost:5173
npm run server     # room server for online, ranked, spectating and leaderboards (port 8787)
```

Production (one process serves the game and the online server):

```bash
npm run build
PORT=8787 npm run server   # serves dist/ + WebSocket /ws + /api/*
```

If the game and the server are on different hosts, build with `VITE_SERVER_URL=https://your-server`. Online play is peer-to-peer over WebRTC (STUN). If a direct connection can't be made, it falls back to relaying through the server's WebSocket.

The game is an installable PWA: fullscreen, landscape, cached for offline play.

## Tests

```bash
npm test           # determinism, rollback resimulation, frame data, combos, parry, throws,
                   # rage cancel, burst, sidestep, wall splat, finishers, weapons, assists, supers,
                   # charge & 360 inputs, guard crush, time-up
npm run typecheck
```

## Project layout

```
src/sim/      deterministic fight simulation (pure TS, no DOM): rules, frame data, roster, stages
src/render/   Three.js renderer: rigs, poses, stages, VFX/gore, finishers, portraits
src/ui/       HUD, touch controller, fake-news generator, DOM helpers
src/ai/       CPU opponent + ghost learning
src/net/      WebRTC transport + rollback driver + spectator driver
src/modes/    perks, campaign, daily challenge data
src/core/     input sources, storage, replays, clip capture
src/audio/    synthesized SFX, adaptive music, announcer
server/       zero-dependency Node room server (WebSocket, matchmaking, leaderboards)
```
