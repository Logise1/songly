export async function getAudioUrl(title, artist) {
    const query = encodeURIComponent(`${title} ${artist}`);
    try {
        const response = await fetch(`https://itunes.apple.com/search?term=${query}&entity=song&limit=1`);
        const data = await response.json();

        if (data && data.results && data.results.length > 0) {
            return data.results[0].previewUrl;
        }
        return null;
    } catch (error) {
        console.error("Error fetching preview from Apple Music:", error);
        return null;
    }
}
