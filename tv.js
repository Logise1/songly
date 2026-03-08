import { db } from './firebase-config.js';
import { doc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
import { generateCategories, generateSongsForCategory, evaluateGuess } from './mistral.js';
import { getAudioUrl } from './appleMusic.js';

let gameId = Math.random().toString(36).substring(2, 6).toUpperCase();
let gameState = null;
let gameDocRef = doc(db, 'games', gameId);

let lobbyAudio = new Audio('lobby.webm');
lobbyAudio.loop = true;

let thinkingAudio = new Audio('thinking.webm');
thinkingAudio.loop = true;

let songAudio = new Audio();
let tickInterval = null;

let currentRound = 1;

// Synthesize Tick
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playTick() {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.frequency.setValueAtTime(800, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);

    gain.gain.setValueAtTime(1, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.1);
}

// App Container
const app = document.getElementById('app');

async function initTV() {
    await setDoc(gameDocRef, {
        state: 'lobby',
        players: {},
        currentRound: 1,
        categories: [],
        winningCategory: null,
        songs: [],
        currentSongIndex: 0,
        songRevealState: {
            playTime: 0.5,
            status: 'waiting_start',
            currentGuesser: null,
            guessText: null,
            endTime: 0
        }
    });

    onSnapshot(gameDocRef, (doc) => {
        const newState = doc.data();
        if (newState) {
            const oldState = gameState;
            gameState = newState;
            handleStateChange(oldState, newState);
        }
    });

    renderLobby();
    lobbyAudio.play().catch(e => { /* Autoplay blocked, needs user click */ });

    document.addEventListener('keydown', (e) => {
        if (e.code === 'Space' && gameState.state === 'lobby') {
            startGame();
        }
    });
}

function renderLobby() {
    // Generar url de manera correcta asegurando un formato amigable
    const joinUrl = window.location.href.split('index.html')[0] + 'mobile.html?gameId=' + gameId;

    app.innerHTML = `
        <div class="lobby-layout">
            <div class="lobby-banner animated">
                <div class="banner-text">
                    <h1>🕹️ Songly</h1>
                    <p>Únete en <strong>${joinUrl}</strong></p>
                    <p>Código de Sala: <strong style="font-size:1.5em">${gameId}</strong></p>
                </div>
                <div class="banner-qr">
                    <canvas id="qrcode"></canvas>
                </div>
            </div>
            <div class="lobby-center animated">
                <h2 id="lobbyTitle">Esperando Jugadores...</h2>
                <div id="playersList" class="players-grid center-grid"></div>
                <div class="lobby-actions">
                    <p class="status-msg">Presiona <strong>ESPACIO</strong> o haz clic para Comenzar</p>
                    <button id="startBtn">COMENZAR JUEGO</button>
                </div>
            </div>
        </div>
        <div class="music-note n1">♪</div>
        <div class="music-note n2">♫</div>
    `;

    QRCode.toCanvas(document.getElementById('qrcode'), joinUrl, { width: 140, margin: 2, scale: 4 });

    document.getElementById('startBtn').addEventListener('click', startGame);

    // Resume audio context if browser paused it
    document.body.addEventListener('click', () => {
        if (lobbyAudio.paused && gameState && gameState.state === 'lobby') {
            lobbyAudio.play();
        }
    }, { once: true });

    updatePlayersInLobby();
}

function updatePlayersInLobby() {
    if (!gameState || gameState.state !== 'lobby') return;
    const list = document.getElementById('playersList');
    const title = document.getElementById('lobbyTitle');
    if (!list) return;

    list.innerHTML = '';
    const players = gameState.players || {};
    const keys = Object.keys(players);

    if (title) {
        title.innerText = keys.length > 0 ? `Jugadores Conectados (${keys.length})` : 'Esperando Jugadores...';
    }

    keys.forEach(pId => {
        const p = players[pId];
        list.innerHTML += `<div class="player-pill">👤 ${p.name} <span>⭐ ${p.score || 0}</span></div>`;
    });
}

async function startGame() {
    if (Object.keys(gameState.players).length === 0 && !window.bypassPlayerCheck) {
        alert("¡Espera a que se una al menos un jugador!");
        return;
    }
    lobbyAudio.pause();
    currentRound = 1;
    await setDoc(gameDocRef, { currentRound: 1 }, { merge: true });
    startRound();
}

async function startRound() {
    if (currentRound > 5) {
        showFinalLeaderboard();
        return;
    }

    // Reset player active states
    const updates = { state: 'loading_categories', categories: [], winningCategory: null };
    await setDoc(gameDocRef, updates, { merge: true });

    thinkingAudio.play().catch(e => console.warn("Audio policy", e));
    renderLoading("Generando categorías para la Ronda " + currentRound + "...");

    const categories = await generateCategories();

    // Set voting
    const resetVotesObj = {};
    Object.keys(gameState.players).forEach(pId => {
        resetVotesObj[`players.${pId}.vote`] = null;
    });

    await setDoc(gameDocRef, { ...resetVotesObj, state: 'voting', categories: categories }, { merge: true });
}

function renderLoading(text) {
    app.innerHTML = `
            <div class="full-center animated" >
            <h1 style="font-size: 8rem; animation: pulse 1s infinite alternate">⏳</h1>
            <h2>${text}</h2>
        </div>
            `;
}

function renderVoting() {
    app.innerHTML = `
            <div class="v-stack animated" >
            <h1>Ronda ${currentRound}</h1>
            <h2>¡Votad por una categoría en vuestro móvil!</h2>
            <div id="voteGrid" class="categories-grid"></div>
            <div class="time-bar-bg"><div id="voteTimeBar" class="time-bar-fill"></div></div>
            <h3 id="voteTimeLeft" style="margin-top:20px;">15s</h3>
        </div>
            `;
    updateVoteCounts();

    let timeLeft = 15;
    let bar = document.getElementById('voteTimeBar');
    let text = document.getElementById('voteTimeLeft');

    let timer = setInterval(async () => {
        if (gameState.state !== 'voting') { clearInterval(timer); return; }
        timeLeft--;
        if (bar) bar.style.width = (timeLeft / 15) * 100 + "%";
        if (text) text.innerText = timeLeft + "s";

        if (timeLeft <= 0) {
            clearInterval(timer);
            // resolve winner
            let votesCount = {};
            gameState.categories.forEach(c => votesCount[c] = 0);
            Object.values(gameState.players).forEach(p => {
                if (p.vote && votesCount[p.vote] !== undefined) votesCount[p.vote]++;
            });
            let winner = gameState.categories[0];
            let maxV = -1;
            Object.keys(votesCount).forEach(c => {
                if (votesCount[c] > maxV) { maxV = votesCount[c]; winner = c; }
            });

            await setDoc(gameDocRef, { state: 'winner_selected', winningCategory: winner }, { merge: true });
            setTimeout(() => {
                loadSongsForCategory(winner);
            }, 4000);
        }
    }, 1000);
}

function renderWinnerSelected() {
    thinkingAudio.pause();
    app.innerHTML = `
            <div class="full-center animated" >
            <h2>Y la categoría elegida es...</h2>
            <h1>${gameState.winningCategory}</h1>
        </div>
            `;
}

function updateVoteCounts() {
    if (gameState.state !== 'voting') return;
    const grid = document.getElementById('voteGrid');
    if (!grid) return;

    let votesCount = {};
    if (gameState.categories) {
        gameState.categories.forEach(c => votesCount[c] = 0);
        Object.values(gameState.players).forEach(p => {
            if (p.vote && votesCount[p.vote] !== undefined) votesCount[p.vote]++;
        });

        grid.innerHTML = gameState.categories.map(c => `
            <div class="category-card" >
                <div class="category-title">${c}</div>
                <div class="vote-count">${votesCount[c]} votos</div>
            </div>
            `).join('');
    }
}

async function loadSongsForCategory(category) {
    thinkingAudio.play();
    await setDoc(gameDocRef, { state: 'loading_songs' }, { merge: true });
    renderLoading("Buscando las mejores canciones de " + category + "...");

    const candidateSongs = await generateSongsForCategory(category);
    let songsWithPreview = [];

    for (let song of candidateSongs) {
        const previewUrl = await getAudioUrl(song.title, song.artist);
        if (previewUrl) {
            songsWithPreview.push({ ...song, previewUrl });
        }
    }

    // If not enough, well, let's just play what we have
    if (songsWithPreview.length === 0) {
        alert("Oh no, falló Apple Music o Mistral. Saltando ronda.");
        currentRound++;
        startRound();
        return;
    }

    thinkingAudio.pause();
    await setDoc(gameDocRef, {
        state: 'playing',
        songs: songsWithPreview,
        currentSongIndex: 0,
        songRevealState: {
            playTime: 0.5,
            status: 'countdown',
            currentGuesser: null,
            guessText: null,
            endTime: 0
        }
    }, { merge: true });

    startSongRound();
}

function startSongRound() {
    if (!gameState.songs || gameState.currentSongIndex >= gameState.songs.length) {
        // Fin de ronda
        currentRound++;
        setDoc(gameDocRef, { state: 'round_leaderboard' }, { merge: true });
        setTimeout(() => startRound(), 10000);
        return;
    }

    songAudio.src = gameState.songs[gameState.currentSongIndex].previewUrl;
    songAudio.currentTime = 0;

    doCountdown();
}

function doCountdown() {
    app.innerHTML = `
            <div class="full-center animated" >
            <h2>Preparados...</h2>
            <div id="countdown" class="countdown">3</div>
        </div>
            `;
    let count = 3;
    let cdInterval = setInterval(() => {
        count--;
        if (count > 0) {
            document.getElementById('countdown').innerText = count;
        } else {
            clearInterval(cdInterval);
            playCurrentSongFragment();
        }
    }, 1000);
}

function renderLeaderboard(title) {
    let sortedPlayers = Object.entries(gameState.players).map(e => ({ id: e[0], ...e[1] })).sort((a, b) => b.score - a.score);

    app.innerHTML = `
            <div class="v-stack animated" >
            <h1>${title}</h1>
            <div class="leaderboard">
                ${sortedPlayers.map((p, i) => `
                    <div class="leaderboard-row ${i === 0 ? 'first' : ''}">
                        <span>${i === 0 ? '👑 ' : ''}${p.name}</span>
                        <span>${p.score || 0} pts</span>
                    </div>
                `).join('')}
            </div>
        </div>
            `;
}

function showFinalLeaderboard() {
    setDoc(gameDocRef, { state: 'game_over' }, { merge: true });
    renderLeaderboard("¡Juego Terminado! Ranking Final");
    lobbyAudio.play();
}

function handleStateChange(oldState, newState) {
    if (newState.state === 'lobby') {
        updatePlayersInLobby();
    }

    if (!oldState) return;

    if (newState.state === 'voting') {
        updateVoteCounts();
        if (oldState.state !== 'voting') renderVoting();
    }
    else if (newState.state === 'winner_selected' && oldState.state !== 'winner_selected') {
        renderWinnerSelected();
    }
    else if (newState.state === 'round_leaderboard' && oldState.state !== 'round_leaderboard') {
        renderLeaderboard("Clasificación - Fin de Ronda " + (currentRound - 1));
    }
    else if (newState.state === 'playing') {
        handlePlayingState(oldState, newState);
    }
}

function handlePlayingState(oldState, newState) {
    const sOld = oldState.songRevealState;
    const sNew = newState.songRevealState;
    if (!sNew) return;

    if (sNew.status === 'guessing' && sOld.status !== 'guessing') {
        const guesserName = newState.players[sNew.currentGuesser].name;
        app.innerHTML = `
            <div class="full-center animated" >
                <h1 style="font-size: 8rem;">🤔</h1>
                <h2 class="guess-msg">${guesserName} está adivinando...</h2>
            </div>
            `;
        songAudio.pause();
        clearInterval(tickInterval);
    }

    if (sNew.status === 'evaluating_guess' && sOld.status !== 'evaluating_guess') {
        processGuessEvaluation(newState);
    }
}

async function playCurrentSongFragment() {
    const revealStatus = gameState.songRevealState;
    let timeToPlay = revealStatus.playTime;
    if (timeToPlay > 30) timeToPlay = 30; // Max preview limit usually 30s

    app.innerHTML = `
            <div class="full-center animated" >
            <h1 style="font-size: 8rem; animation: pulse 0.5s infinite alternate">🎵</h1>
            <h2>Escuchando (${timeToPlay}s)...</h2>
        </div>
            `;

    songAudio.currentTime = 0;
    try {
        await songAudio.play();
    } catch (e) { console.error("Could not play", e); }

    setTimeout(async () => {
        songAudio.pause();

        // Setup wait state format 10s
        await setDoc(gameDocRef, {
            'songRevealState.status': 'waiting',
            'songRevealState.endTime': Date.now() + 10000
        }, { merge: true });

        startWaitingForGuessers();

    }, timeToPlay * 1000);
}

function startWaitingForGuessers() {
    app.innerHTML = `
            <div class="full-center animated" >
            <h2>¡Lo sé!</h2>
            <h1 id="waitTimer" style="font-size: 10rem;">10</h1>
            <h3>Pulsa el botón en tu móvil</h3>
        </div>
            `;

    let timeLeft = 10;
    tickInterval = setInterval(async () => {
        if (gameState.songRevealState.status !== 'waiting') {
            clearInterval(tickInterval);
            return;
        }

        playTick();
        timeLeft--;
        const tEl = document.getElementById('waitTimer');
        if (tEl) tEl.innerText = timeLeft;

        if (timeLeft <= 0) {
            clearInterval(tickInterval);

            // Increment play time and repeat if nobody pressed
            let nextPlayTime = 0;
            let currentPt = gameState.songRevealState.playTime;
            if (currentPt === 0.5) nextPlayTime = 1;
            else if (currentPt === 1) nextPlayTime = 2;
            else if (currentPt === 2) nextPlayTime = 4;
            else nextPlayTime = 1000; // Plays completely until pressed

            if (currentPt === 1000) {
                // Was already playing fully and ended? Skip song
                await endSongSkipped();
            } else {
                await setDoc(gameDocRef, {
                    'songRevealState.playTime': nextPlayTime,
                    'songRevealState.status': 'countdown'
                }, { merge: true });
                playCurrentSongFragment();
            }
        }
    }, 1000);

    // Check if song ends while playing 1000
    songAudio.onended = async () => {
        if (gameState.songRevealState.playTime === 1000 && gameState.songRevealState.status === 'waiting') {
            await endSongSkipped();
        }
    }
}

async function endSongSkipped() {
    clearInterval(tickInterval);
    const currSong = gameState.songs[gameState.currentSongIndex];
    app.innerHTML = `
            <div class="full-center animated" >
            <h1 style="color: grey;">Nadie acertó</h1>
            <h2>Era: ${currSong.title} de ${currSong.artist}</h2>
        </div>
            `;
    setTimeout(async () => {
        await nextSong();
    }, 5000);
}

async function processGuessEvaluation(state) {
    const sState = state.songRevealState;
    const guess = sState.guessText;
    const currSong = state.songs[state.currentSongIndex];

    app.innerHTML = `
            <div class="full-center animated" >
            <h2>Evaluando respuesta...</h2>
            <h3>"${guess}"</h3>
        </div>
            `;

    const isCorrect = await evaluateGuess(guess, currSong.title, currSong.artist);

    if (isCorrect) {
        // Calculate points based on playTime
        let points = 20;
        if (sState.playTime === 0.5) points = 100;
        else if (sState.playTime === 1) points = 80;
        else if (sState.playTime === 2) points = 60;
        else if (sState.playTime === 4) points = 40;

        const updates = {};
        updates[`players.${sState.currentGuesser}.score`] = (state.players[sState.currentGuesser].score || 0) + points;

        app.innerHTML = `
            <div class="full-center animated" style = "background: rgba(0, 255, 127, 0.2)" >
                 <h1 style="color: #00ff7f;">¡CORRECTO!</h1>
                 <h2>${state.players[sState.currentGuesser].name} gana ${points} puntos</h2>
                 <h3>${currSong.title} - ${currSong.artist}</h3>
             </div>
            `;
        await setDoc(gameDocRef, updates, { merge: true });

        setTimeout(async () => {
            await nextSong();
        }, 5000);

    } else {
        // Incorrecto
        app.innerHTML = `
            <div class="full-center animated" style = "background: rgba(255, 0, 127, 0.2)" >
                 <h1 style="color: #ff007f;">¡INCORRECTO!</h1>
                 <h2>${state.players[sState.currentGuesser].name} ha fallado</h2>
             </div>
            `;

        setTimeout(async () => {
            // Regresa a donde estaba (o al siguiente paso, simplificamos y seguimos contando el wait o pasa al siguiente fragmento)
            let nextPlayTime = sState.playTime;
            if (sState.playTime === 0.5) nextPlayTime = 1;
            else if (sState.playTime === 1) nextPlayTime = 2;
            else if (sState.playTime === 2) nextPlayTime = 4;
            else nextPlayTime = 1000;

            await setDoc(gameDocRef, {
                'songRevealState.playTime': nextPlayTime,
                'songRevealState.status': 'countdown',
                'songRevealState.currentGuesser': null,
                'songRevealState.guessText': null
            }, { merge: true });

            playCurrentSongFragment();

        }, 3000);
    }
}

async function nextSong() {
    const nextIndex = gameState.currentSongIndex + 1;
    await setDoc(gameDocRef, {
        currentSongIndex: nextIndex,
        'songRevealState.status': 'waiting_start',
        'songRevealState.playTime': 0.5,
        'songRevealState.currentGuesser': null,
        'songRevealState.guessText': null
    }, { merge: true });

    startSongRound();
}

window.bypassPlayerCheck = false;

initTV();
