import { db } from './firebase-config.js';
import { doc, setDoc, onSnapshot, getDoc } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

const app = document.getElementById('app');

const urlParams = new URLSearchParams(window.location.search);
const gameId = urlParams.get('gameId');

if (!gameId) {
    app.innerHTML = '<div class="full-center"><h1>Error</h1><p>No se encontró el código de partida en la URL.</p></div>';
    throw new Error('No gameId');
}

let playerId = localStorage.getItem('songly_playerId');
if (!playerId) {
    playerId = Math.random().toString(36).substring(2, 9);
    localStorage.setItem('songly_playerId', playerId);
}

let playerName = localStorage.getItem('songly_playerName') || '';
let gameState = null;
let gameDocRef = doc(db, 'games', gameId);

async function initMobile() {
    if (!playerName) {
        renderLogin();
    } else {
        await joinGame();
    }
}

function renderLogin() {
    app.innerHTML = `
        <div class="full-center animated">
            <h1>Songly</h1>
            <h2>🎧 Únete a la sala ${gameId}</h2>
            <input type="text" id="nameInput" placeholder="Tu nombre" maxlength="15" autocomplete="off" />
            <button id="joinBtn">ENTRAR AL JUEGO</button>
        </div>
    `;

    document.getElementById('joinBtn').addEventListener('click', async () => {
        let n = document.getElementById('nameInput').value.trim();
        if (n) {
            playerName = n;
            localStorage.setItem('songly_playerName', n);
            await joinGame();
        }
    });
}

async function joinGame() {
    app.innerHTML = '<div class="full-center"><h2>Conectando...</h2></div>';

    // Join as player
    const updates = {};
    updates[`players.${playerId}`] = { name: playerName, score: 0, connected: true, vote: null };
    await setDoc(gameDocRef, updates, { merge: true });

    onSnapshot(gameDocRef, (doc) => {
        const newState = doc.data();
        if (newState) {
            handleStateChange(gameState, newState);
            gameState = newState;
        } else {
            app.innerHTML = '<div class="full-center"><h2>La partida ha terminado o no existe.</h2></div>';
        }
    });
}

function handleStateChange(oldState, newState) {
    if (newState.state === 'lobby') {
        app.innerHTML = `
        <div class="full-center animated" >
                <h1>Hola ${playerName}! 👋</h1>
                <h2>Mira la pantalla principal para empezar.</h2>
            </div>
        `;
    }
    else if (newState.state === 'voting') {
        renderVoting(newState);
    }
    else if (newState.state === 'loading_categories' || newState.state === 'loading_songs' || newState.state === 'winner_selected' || newState.state === 'round_leaderboard') {
        app.innerHTML = `
        <div class="full-center animated" >
                <h1>👀</h1>
                <h2>Atento a la TV...</h2>
            </div>
        `;
    }
    else if (newState.state === 'playing') {
        handlePlayingState(newState);
    }
    else if (newState.state === 'game_over') {
        app.innerHTML = `
        <div class="full-center animated" >
                <h1>🏆 Fin del juego</h1>
                <h2>¡Mira los resultados en la TV!</h2>
            </div>
        `;
    }
}

function renderVoting(state) {
    const myVote = state.players[playerId]?.vote;

    app.innerHTML = `
        <div class="v-stack animated" >
            <h2>Elige categoría</h2>
            <div class="categories-grid">
                ${state.categories.map(c => `
                    <button class="category-card ${myVote === c ? 'selected' : ''}" data-cat="${c}" style="font-size: 1.5rem; color: white;">
                        ${c}
                    </button>
                `).join('')}
            </div>
        </div>
        `;

    document.querySelectorAll('.category-card').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const cat = e.target.getAttribute('data-cat');
            const updates = {};
            updates[`players.${playerId}.vote`] = cat;
            await setDoc(gameDocRef, updates, { merge: true });
        });
    });
}

function handlePlayingState(state) {
    const s = state.songRevealState;
    if (!s) return;

    if (s.status === 'countdown') {
        app.innerHTML = `
        <div class="full-center animated" >
                <h1 style="font-size: 4rem;">🎵</h1>
                <h2>¡Escucha atenta(o)!</h2>
            </div>
        `;
    }
    else if (s.status === 'waiting') {
        app.innerHTML = `
        <div class="full-center animated" style = "background: rgba(138, 43, 226, 0.2);" >
            <button id="iknowBtn" class="btn-huge">¡LO SÉ!</button>
            </div>
        `;
        document.getElementById('iknowBtn').addEventListener('click', async () => {
            // Transaction-like behavior with getDoc and setDoc is better, but simple fast setDoc works for non-strict games
            // Optimistic lock check
            const freshDoc = await getDoc(gameDocRef);
            const freshState = freshDoc.data();
            if (freshState.songRevealState.status === 'waiting' && freshState.songRevealState.currentGuesser === null) {
                app.innerHTML = '<div class="full-center"><h2>Pulsado, esperando...</h2></div>';
                await setDoc(gameDocRef, {
                    'songRevealState.status': 'guessing',
                    'songRevealState.currentGuesser': playerId
                }, { merge: true });
            }
        });
    }
    else if (s.status === 'guessing') {
        if (s.currentGuesser === playerId) {
            app.innerHTML = `
        <div class="full-center animated" >
                    <h2>¿Qué canción es?</h2>
                    <input type="text" id="guessInput" placeholder="Título y/o Artista" />
                    <button id="guessBtn">ENVIAR</button>
                </div>
        `;
            document.getElementById('guessBtn').addEventListener('click', async () => {
                const val = document.getElementById('guessInput').value.trim();
                if (val) {
                    app.innerHTML = '<div class="full-center"><h2>Enviado...</h2></div>';
                    await setDoc(gameDocRef, {
                        'songRevealState.status': 'evaluating_guess',
                        'songRevealState.guessText': val
                    }, { merge: true });
                }
            });
        } else {
            app.innerHTML = `
        <div class="full-center animated" >
                    <h1>🤫</h1>
                    <h2>Alguien más está adivinando...</h2>
                </div>
        `;
        }
    }
    else if (s.status === 'evaluating_guess') {
        app.innerHTML = `
        <div class="full-center animated" >
            <h2>Evaluando la respuesta...</h2>
            </div>
        `;
    }
}

initMobile();
