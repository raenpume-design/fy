const CACHE_NAME = 'mi-app-cache-v1';
const urlsToCache = [
    '/',
    '/index.html',
    '/styles.css',
    '/app.js',
    '/manifest.json'
];

// Instalar el Service Worker y almacenar los archivos en caché
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Archivos en caché con éxito');
                return cache.addAll(urlsToCache);
            })
    );
});

// Interceptar las peticiones para servir desde caché (Estrategia: Cache First)
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                // Si el archivo está en la caché, lo devolvemos
                if (response) {
                    return response;
                }
                // Si no, lo pedimos a la red
                return fetch(event.request);
            })
    );
});

// Actualizar el Service Worker y limpiar cachés antiguas
self.addEventListener('activate', (event) => {
    const cacheWhitelist = [CACHE_NAME];
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});
