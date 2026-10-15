/* Fuel Pro Firebase Web configuration for Firebase Hosting only.
 * Config is served by Firebase Hosting's public reserved endpoint.
 * No credentials or hardcoded key live in the GitHub repository.
 */
window.FuelProFirebaseSettings = {enabled: false, config: null};
(async function(){
  try {
    if (location.hostname !== 'fuelpro-app-832.web.app' &&
        location.hostname !== 'fuelpro-app-832.firebaseapp.com') return;
    const response = await fetch('/__/firebase/init.json', {cache: 'no-store'});
    if (!response.ok) throw new Error('config unavailable: ' + response.status);
    const config = await response.json();
    if (config.projectId !== 'fuelpro-app-832' || !config.apiKey ||
        !config.authDomain || !config.appId) throw new Error('Firebase project mismatch');
    window.FuelProFirebaseSettings = {enabled: true, config};
    window.dispatchEvent(new Event('fuelpro-firebase-ready'));
  } catch (error) {
    console.error('Fuel Pro Firebase config disabled:',error);
    window.dispatchEvent(new Event('fuelpro-firebase-unavailable'));
  }
})();
