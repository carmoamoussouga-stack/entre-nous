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

Au démarrage, un écran d'entrée présente le logo « ENTRE NOUS » avec une courte animation de chargement ; l'interface s'ouvre ensuite automatiquement.

## Jouer en réseau

1. Sur l'accueil, **Créer une nouvelle salle** ouvre une salle et attribue un nom par défaut (« Joueur 1 »), modifiable dans la salle. Aucun prénom n'est demandé avant la connexion.
2. L'hôte partage le code à 6 chiffres affiché en grand sur la page de la salle, avec le bouton **Copier le code**. Le code reste le même tant que la salle existe.
3. Chaque autre joueur entre uniquement le code avec **Rejoindre la salle**, puis choisit son nom dans la salle. Chaque appareil ou onglet représente un joueur distinct : un nouvel onglet qui saisit le code entre comme nouveau joueur.
4. L'hôte lance la partie dès que deux joueurs ou plus sont présents.
5. Le joueur dont c'est le tour choisit une personne dans **À qui posez-vous la question ?**, puis un mode (Vérité, Action, Choix multiple, Tu préfères). Le jeu propose une question dans une zone modifiable : on peut l'ajuster ou demander **Autre proposition**. **Poser cette question** l'envoie.
6. La question s'affiche sur tous les appareils. Seule la personne interrogée peut répondre ; sa réponse apparaît automatiquement chez tout le monde, sans bouton « Révéler ».
7. Le poseur peut interroger plusieurs personnes à la suite avec **Interroger quelqu'un d'autre**, puis **Passer la main** pour laisser le tour au joueur suivant. Ctrl+Maj+D affiche le menu debug caché.

Le bouton **Retour à l'accueil** ramène à l'écran de connexion. Il n'y a pas de bouton pour terminer la soirée en ligne : on revient simplement à l'accueil. Un joueur qui n'est pas l'hôte peut revenir à l'accueil sans perdre sa place, puis la reprendre plus tard.

### Inviter par lien

- Dès la création de la salle, le serveur construit une URL `https://domaine/?room=CODE` et l'envoie avec la salle. Le domaine est lu dynamiquement : `RENDER_EXTERNAL_URL` sur Render, sinon l'en-tête `Host` de la requête (avec `X-Forwarded-Proto` derrière un proxy), ce qui fonctionne aussi en local.
- Le bouton **💌 Inviter un ami** de la salle utilise `navigator.share()` quand il est disponible (partage natif du téléphone : WhatsApp, SMS, e-mail…) avec le message « Rejoins-moi sur Entre Nous : [lien] ». Sinon, il copie ce message dans le presse-papiers et affiche « Lien copié ! ».
- Le lien est aussi affiché en clair dans la salle, en petit texte sélectionnable, pour copier à la main sur ordinateur.
- En ouvrant un tel lien, l'application pré-remplit le code, affiche « Tu rejoins la salle CODE… » et envoie la demande de jointure automatiquement (aucune saisie : le serveur attribue un nom par défaut, modifiable dans la salle). Si la salle est une salle sensuelle, le client réessaie automatiquement avec le bon type de salle. Une fois rejoint, le paramètre `?room=` est retiré de l'adresse pour qu'un rafraîchissement ne rejoue pas la jointure.

### Reprendre une salle

- La place d'un onglet est conservée dans le stockage de session du navigateur : un rafraîchissement permet de retrouver la même place en ressaisissant le code.
- Le bouton **Reprendre la salle** de l'accueil retrouve la dernière salle fréquentée sur cet appareil (un accueil distinct pour le jeu sensuel). Il s'appuie sur une liste de places enregistrées pour chaque salle et essaie l'hôte en priorité, puis les autres places. Si toutes sont déjà ouvertes ailleurs, le joueur entre comme nouveau joueur.
- Une coupure réseau passagère est reprise automatiquement par le client, sans recréer de salle.
- Un départ volontaire de l'hôte ferme la salle immédiatement pour tout le monde : les autres joueurs doivent créer une nouvelle salle et obtiennent un nouveau code.
- Si l'hôte disparaît sans le vouloir (coupure, onglet fermé), sa salle reste ouverte pendant 60 secondes. S'il revient dans ce délai, elle reste en place ; sinon elle est fermée et les joueurs restants reviennent à l'accueil. Le rôle d'hôte n'est plus transféré automatiquement.

L'hôte est le premier joueur à créer la salle. Il est le seul à pouvoir lancer/rejouer. Seul le joueur actif pose les questions et peut passer la main. Si ce joueur ferme son onglet, la main passe automatiquement au joueur suivant après quelques secondes (le temps qu'il puisse se reconnecter). Les joueurs absents restent dans la liste.

### Le jeu sensuel · 18+

Le jeu sensuel est un espace entièrement séparé du jeu classique : il possède ses propres salles, ses propres codes à 6 chiffres et ses propres questions. Aucune catégorie 18+ n'apparaît jamais dans une soirée Entre Nous classique.

- Depuis l'accueil, le panneau rose **Jeu sensuel · 18+** ouvre son écran de connexion dédié : **Entrer dans le jeu sensuel** permet de saisir le code d'une salle sensuelle ou d'en **Créer une salle sensuelle**.
- Un code n'ouvre qu'un type de salle : entrer un code de soirée classique depuis l'accueil sensuel (ou l'inverse) est refusé avec un message explicite.
- Dans une salle sensuelle, le joueur actif choisit une catégorie (**💋 Vérité chaude**, **🔥 Action sensuelle**, **🍑 Choix multiple**) puis pose la question, avec le même flux éditable qu'en ligne. À côté de ces trois catégories, le bouton **✍️ Poser une question** ouvre une zone vide : c'est le poseur qui tape lui-même sa question sensuelle (envoyée en « question libre »). Les questions intégrées sont volontairement hot : vérités brûlantes, actions osées et choix multiple coquins. Une question écrite par un joueur sert uniquement à la question posée : elle n'est jamais enregistrée sur le serveur ni réutilisée par quelqu'un d'autre.
- **Preuve photo** : une action sensuelle peut être relevée avec une photo envoyée à toute la salle — caméra directe ou photo importée depuis l'appareil (bouton **📷 Preuve photo** sous la question). La photo est facultative, elle est diffusée en direct comme preuve, limitée en taille et **jamais écrite sur le serveur ni conservée sur disque**.
- Le **Choix multiple** remplace l'ancienne catégorie « Conséquence », qui a été supprimée partout (en ligne comme hors ligne).
- Le bouton **Jouer hors ligne sur un seul appareil** de cet écran ouvre le jeu sensuel hors ligne (le code 6969 n'est utilisé que pour cette version hors ligne).

Le jeu hors ligne classique reste disponible sans serveur : sur l'accueil, dépliez **Jouer à plusieurs sur un seul appareil** pour saisir les prénoms et lancer une partie en passant le téléphone. Le mode **🎲 Vérité ou choix multiple** a remplacé l'ancien « Vérité ou conséquence ».

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

Le service gratuit peut s'endormir après une période sans activité ; la première ouverture suivante peut prendre un peu de temps. Le fichier `data/rooms.json` sauvegarde l'état des salles côté serveur (joueurs et parties en cours), mais le disque d'un service Render gratuit est éphémère : ces données peuvent disparaître lors d'un redéploiement ou d'un redémarrage. Pour garantir leur conservation en production, il faut un stockage persistant (par exemple un disque Render payant ou une base de données). Les salles enregistrées localement ne sont pas une base de données durable. Les questions écrites par les joueurs ne sont jamais conservées.

## Fichiers

- `entre-nous.html` — client autonome HTML/CSS/JS.
- `server.js` — serveur HTTP, WebSocket, règles de salle et sauvegarde JSON.
- `package.json` — dépendance serveur `ws` et commande de démarrage.
