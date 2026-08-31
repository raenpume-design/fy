document.addEventListener('DOMContentLoaded', () => {
    // Aquí puedes agregar la lógica de tu interfaz de usuario
    console.log("La aplicación ha cargado correctamente.");
});

// Registrar el Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then((registration) => {
                console.log('Service Worker registrado con éxito. Scope:', registration.scope);
            })
            .catch((error) => {
                console.error('El registro del Service Worker falló:', error);
            });
    });
}
