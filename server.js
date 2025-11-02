const express = require('express');
const path = require('path');
const { OBSWebSocket } = require('obs-websocket-js');
const fs = require('fs');

const app = express();
const PORT = 3000;

// ONIBAKUMAN

// Configuration
const SECRET_TOKEN = 'stream_SFX';
const SFX_FOLDER = 'C:\\Program Files\\obs-studio\\PhantomBot\\SFX';
const OBS_PASSWORD = 'skFkumkBNRW0m5ML';
const OBS_PORT = 4455;
const SCENE_NAME = 'STREAM-GAME_1(CAM1)';
const SOURCE_NAME = 'PhantomBot_SFX';

const obs = new OBSWebSocket();

/* ---------------- Route health ---------------- */
app.get('/health', (req, res) => {
  console.log('[HEALTH] Ping reçu de', req.ip);
  res.status(200).send('OK');
});

/* ---------------- Connexion OBS robuste ---------------- */
(async () => {
  try {
    // Tentative API v5 (OBS ≥28)
    await obs.connect(`ws://localhost:${OBS_PORT}`, { password: OBS_PASSWORD });
    console.log('[OBS] Connecté avec succès (API v5)');
  } catch (errV5) {
    console.warn('[OBS] Connexion v5 échouée:', errV5.message || errV5);
    try {
      // Tentative API v4 (ancien plugin obs-websocket)
      await obs.connect(`ws://localhost:${OBS_PORT}`, OBS_PASSWORD);
      console.log('[OBS] Connecté avec succès (API v4)');
    } catch (errV4) {
      console.error('[OBS] Erreur connexion OBS (v4 et v5 ont échoué):', errV4.message || errV4);
      console.error('⚠️ Vérifie la version de obs-websocket-js et le plugin obs-websocket dans OBS.');
    }
  }
})();

/* ---------------- Fonction utilitaire ---------------- */
async function playSound(sfxName, res) {
  console.log('[PLAY] Début playSound pour :', sfxName);

  // Recherche du fichier
  const fileBase = path.join(SFX_FOLDER, sfxName);
  const extensions = ['', '.wav', '.mp3', '.ogg'];
  let finalPath = null;

  for (const ext of extensions) {
    const candidate = fileBase + ext;
    if (fs.existsSync(candidate)) {
      finalPath = candidate;
      break;
    }
  }

  if (!finalPath) {
    console.warn('[PLAY] Fichier introuvable pour :', sfxName);
    return res.status(404).send('Son introuvable');
  }

  console.log('[PLAY] Fichier trouvé :', finalPath);

  try {
    // Mise à jour de la source OBS
    await obs.call('SetInputSettings', {
      inputName: SOURCE_NAME,
      inputSettings: { local_file: finalPath }
    });

    const { sceneItems } = await obs.call('GetSceneItemList', { sceneName: SCENE_NAME });
    const item = sceneItems.find(i => i.sourceName === SOURCE_NAME);
    if (!item) {
      const msg = 'Source introuvable dans la scène: ' + SOURCE_NAME;
      console.error('[OBS] ' + msg);
      return res.status(500).send(msg);
    }

    console.log('[OBS] SceneItemId trouvé :', item.sceneItemId);

    // Toggle Off → On pour rejouer le son
    await obs.call('SetSceneItemEnabled', { sceneName: SCENE_NAME, sceneItemId: item.sceneItemId, sceneItemEnabled: false });
    await new Promise(r => setTimeout(r, 200));
    await obs.call('SetSceneItemEnabled', { sceneName: SCENE_NAME, sceneItemId: item.sceneItemId, sceneItemEnabled: true });
    await new Promise(r => setTimeout(r, 100));

    try {
      await obs.call('RestartMediaInput', { inputName: SOURCE_NAME });
    } catch (err) {
      console.warn('[OBS] RestartMediaInput erreur (souvent code 204) :', err);
    }

    // Désactivation après 3s
    setTimeout(async () => {
      try {
        await obs.call('SetSceneItemEnabled', {
          sceneName: SCENE_NAME,
          sceneItemId: item.sceneItemId,
          sceneItemEnabled: false
        });
        console.log(`[PLAY] Source ${SOURCE_NAME} désactivée après timeout`);
      } catch (err) {
        console.error('[PLAY] Erreur désactivation différée:', err);
      }
    }, 3000);

    console.log('[PLAY] Son joué avec succès :', sfxName);
    return res.status(200).send('Son joué');
  } catch (err) {
    console.error('[PLAY] Erreur lecture:', err);
    return res.status(500).send('Erreur lecture');
  }
}

/* ---------------- Routes ---------------- */
app.get('/play', async (req, res) => {
  console.log('[PLAY] Requête reçue', req.query, 'from', req.ip);
  const { token, sfx } = req.query;

  if (token !== SECRET_TOKEN) return res.status(403).send('Token invalide');
  if (!sfx) return res.status(400).send('Nom de son manquant');

  await playSound(sfx, res);
});

app.get('/random', async (req, res) => {
  console.log('[RANDOM] Requête reçue', req.query, 'from', req.ip);
  const { token } = req.query;

  if (token !== SECRET_TOKEN) return res.status(403).send('Token invalide');

  try {
    const files = fs.readdirSync(SFX_FOLDER)
      .filter(f => /\.(wav|mp3|ogg)$/i.test(f));

    if (files.length === 0) return res.status(404).send('Aucun son disponible');

    const randomFile = files[Math.floor(Math.random() * files.length)];
    const sfxName = path.parse(randomFile).name;

    console.log('[RANDOM] Fichier choisi :', randomFile, '=>', sfxName);
    await playSound(sfxName, res);
  } catch (err) {
    console.error('[RANDOM] Erreur random:', err);
    res.status(500).send('Erreur random');
  }
});

/* ---------------- Lancement serveur ---------------- */
app.listen(PORT, () => console.log(`Serveur SFX lancé sur http://127.0.0.1:${PORT}`));
