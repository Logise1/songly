const apiKey = "evxly62Xv91b752fbnHA2I3HD988C5RT";
const model = "mistral-medium-latest";

export async function generateCategories() {
    const prompt = "Genera 5 categorías divertidas y variadas de música para un juego de adivinar la canción (por ejemplo: 'Pop de los 2010s', 'Rock Clásico', 'Bandas Sonoras de Disney', 'Anime Intros', 'Reggaeton Antiguo'). Devuelve SOLO un array JSON válido de 5 strings. No pongas comillas invertidas ni markdown, solo el JSON.";
    const result = await askMistral(prompt);
    try {
        return JSON.parse(result);
    } catch (e) {
        console.warn("Failed to parse mistral, retrying...", result);
        const retry = await askMistral(prompt);
        return JSON.parse(retry.replace(/```json/g, '').replace(/```/g, '').trim());
    }
}

export async function generateSongsForCategory(category) {
    const prompt = `Genera 5 canciones muy populares de la categoría de música: "${category}". 
Devuelve SOLO un array JSON válido de objetos con dos propiedades: "title" (título de la canción) y "artist" (nombre del artista). 
No incluyas markdown, solo escribe el JSON puro. Asegúrate de que son canciones con alta probabilidad de estar en Apple Music.`;
    const result = await askMistral(prompt);
    try {
        return JSON.parse(result.replace(/```json/g, '').replace(/```/g, '').trim());
    } catch (e) {
        console.warn("Failed to parse mistral songs, retrying...", result);
        return [];
    }
}

export async function evaluateGuess(guess, actualTitle, actualArtist) {
    const prompt = `El usuario ha intentado adivinar la canción "${actualTitle}" de "${actualArtist}".
Su respuesta fue: "${guess}".
Debido a errores de escritura (typos), faltas de ortografía, o si puso solo el título muy claro, evalúa si la respuesta es CORRECTA. 
Por favor, sé flexible pero justo (si dice "bolebard of broken drem" para "Boulevard of broken dreams", es válida).
Responde ÚNICAMENTE con la palabra "YES" si es correcta o "NO" si es incorrecta. No des explicaciones.`;
    const result = await askMistral(prompt);
    return result.trim().toUpperCase() === "YES";
}

async function askMistral(content) {
    const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: model,
            messages: [{ role: "user", content: content }],
            temperature: 0.7
        })
    });
    if (!res.ok) {
        throw new Error("Mistral API error: " + res.statusText);
    }
    const data = await res.json();
    return data.choices[0].message.content;
}
