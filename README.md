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

1. Sur l'accueil, **Créer une nouvelle salle** ouvre une salle et attribue un nom par défaut (« Joueur 1 »), modifiable dans la salle. Aucun prénom n'est demandé avant la connexion.
2. L'hôte partage le code à 6 chiffres affiché en grand sur la page de la salle, avec le bouton **Copier le code**. Le code reste le même tant que la salle existe.
3. Chaque autre joueur entre uniquement le code avec **Rejoindre la salle**, puis choisit son nom dans la salle. Chaque appareil ou onglet représente un joueur distinct : un nouvel onglet qui saisit le code entre comme nouveau joueur.
4. L'hôte lance la partie dès que deux joueurs ou plus sont présents.
5. Le joueur dont c'est le tour choisit une personne dans **À qui posez-vous la question ?**, puis un mode (Vérité, Action, Choix multiple, Tu préfères, 18+). Le jeu propose une question dans une zone modifiable : on peut l'ajuster, demander **Autre proposition**, ou cliquer sur **Écrire ma propre question** pour la remplacer directement. **Poser cette question** l'envoie.
6. La question s'affiche sur tous les appareils. Seule la personne interrogée peut répondre ; sa réponse apparaît automatiquement chez tout le monde, sans bouton « Révéler ».
7. Le poseur peut interroger plusieurs personnes à la suite avec **Interroger quelqu'un d'autre**, puis **Passer la main** pour laisser le tour au joueur suivant. Ctrl+Maj+D affiche le menu debug caché.

Le bouton **Retour à l'accueil** ramène à l'écran de connexion. Il n'y a pas de bouton pour terminer la soirée en ligne : on revient simplement à l'accueil. Un joueur qui n'est pas l'hôte peut revenir à l'accueil sans perdre sa place, puis la reprendre plus tard.

### Reprendre une salle

- La place d'un onglet est conservée dans le stockage de session du navigateur : un rafraîchissement permet de retrouver la même place en ressaisissant le code.
- Le bouton **Reprendre la salle** de l'accueil retrouve la dernière salle fréquentée sur cet appareil. Il s'appuie sur une liste de places enregistrées pour chaque salle et essaie l'hôte en priorité, puis les autres places. Si toutes sont déjà ouvertes ailleurs, le joueur entre comme nouveau joueur.
- Une coupure réseau passagère est reprise automatiquement par le client, sans recréer de salle.
- Un départ volontaire de l'hôte ferme la salle immédiatement pour tout le monde : les autres joueurs doivent créer une nouvelle salle et obtiennent un nouveau code.
- Si l'hôte disparaît sans le vouloir (coupure, onglet fermé), sa salle reste ouverte pendant 60 secondes. S'il revient dans ce délai, elle reste en place ; sinon elle est fermée et les joueurs restants reviennent à l'accueil. Le rôle d'hôte n'est plus transféré automatiquement.

L'hôte est le premier joueur à créer la salle. Il est le seul à pouvoir lancer/rejouer. Seul le joueur actif pose les questions et peut passer la main. Si ce joueur ferme son onglet, la main passe automatiquement au joueur suivant après quelques secondes (le temps qu'il puisse se reconnecter). Les joueurs absents restent dans la liste.

Le mode 18+ demande le code **6969**. Les questions personnalisées ajoutées dans ce mode sont enregistrées dans la salle côté serveur.

Le jeu hors ligne reste disponible sans serveur : sur l'accueil, dépliez **Jouer à plusieurs sur un seul appareil** pour saisir les prénoms et lancer une partie en passant le téléphone.

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
