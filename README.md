# Entre Nous — version multijoueur

Le client reste un seul fichier HTML, sans framework ni dépendance à installer dans le navigateur. Le serveur Node.js sert ce fichier et synchronise les salles par WebSocket.

## Lancer en local

Installez Node.js 18 ou une version ultérieure. Dans le dossier contenant `entre-nous.html`, `server.js` et `package.json`, exécutez :

```sh
npm install
npm start
```

Ouvrez ensuite **http://localhost:3000**. Pour jouer à plusieurs sur le même réseau Wi-Fi, les autres téléphones doivent ouvrir `http://ADRESSE-IP-DE-L-ORDINATEUR:3000` (autorisez le port 3000 dans le pare-feu si nécessaire). Le serveur WebSocket utilise automatiquement la même adresse.

Sur Windows, l'adresse locale se trouve avec :

```powershell
ipconfig
```

Ne lancez pas le fichier par double-clic (`file://`) pour le multijoueur. Le jeu hors ligne reste utilisable ainsi, mais les salles ont besoin du serveur.

## Jouer en réseau

1. L'hôte laisse le code vide pour créer une salle. Un nom par défaut (« Joueur 1 ») est attribué, puis peut être modifié dans la salle.
2. Il partage le code à 6 chiffres affiché en grand sur la page de la salle, avec le bouton **Copier le code**.
3. Chaque autre joueur entre uniquement le code pour rejoindre, puis choisit son nom dans la salle.
4. L'hôte lance la partie dès que deux joueurs ou plus sont présents.
5. Les modes « Tu préfères », « Devine qui » et le QCM synchronisent les choix et les votes entre les appareils. Ctrl+Maj+D affiche le menu debug caché.

L'hôte est le premier joueur à créer la salle. Il est le seul à pouvoir lancer/rejouer ou terminer la soirée. S'il quitte la salle, le premier joueur encore connecté devient hôte automatiquement. Le joueur actif (ou l'hôte) peut passer au tour suivant. Les joueurs absents restent dans la liste ; un rafraîchissement dans le même onglet permet de reprendre sa place en saisissant à nouveau le code.

Le mode 18+ demande le code **6969**. Les questions personnalisées ajoutées dans ce mode sont enregistrées dans la salle côté serveur. Seul l'identifiant de session du joueur est conservé dans le stockage de session de l'onglet, pour reprendre sa place après un rafraîchissement.

## Déploiement sur Render (offre gratuite)

Render déploie à partir d'un dépôt Git. Placez les trois fichiers du projet dans un dépôt privé ou public, puis :

1. Dans le tableau de bord Render, choisissez **New + → Web Service** et connectez le dépôt.
2. Choisissez la branche et le dossier racine où se trouvent les fichiers.
3. Réglez **Runtime** sur `Node`.
4. Saisissez **Build Command** : `npm install`
5. Saisissez **Start Command** : `npm start`
6. Sélectionnez l'offre **Free**, puis créez le service.
7. Quand le déploiement est terminé, ouvrez l'URL `https://…onrender.com` générée par Render. Les WebSockets passent automatiquement en WSS via HTTPS.

Le port est lu depuis la variable `PORT` fournie par Render. Aucun réglage WebSocket supplémentaire n'est requis.

### Limites importantes de l'offre gratuite

Le service gratuit peut s'endormir après une période sans activité ; la première ouverture suivante peut prendre un peu de temps. Le fichier `data/rooms.json` sauvegarde les joueurs et questions personnalisées côté serveur, mais le disque d'un service Render gratuit est éphémère : ces données peuvent disparaître lors d'un redéploiement ou d'un redémarrage. Pour garantir leur conservation en production, il faut un stockage persistant (par exemple un disque Render payant ou une base de données). Les salles enregistrées localement ne sont pas une base de données durable.

## Fichiers

- `entre-nous.html` — client autonome HTML/CSS/JS.
- `server.js` — serveur HTTP, WebSocket, règles de salle et sauvegarde JSON.
- `package.json` — dépendance serveur `ws` et commande de démarrage.
